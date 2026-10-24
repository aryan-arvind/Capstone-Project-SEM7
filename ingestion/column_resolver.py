"""
Intelligent Header & Synonym Resolver for SME Data Digitalization.
Resolves column header variance across heterogeneous Excel, CSV, and text document layouts.
Supports a 3-Tier Domain-Agnostic Architecture:
  - Tier 1: Universal core tax invoice & inventory schema
  - Tier 2: Domain extension packs (Food, Fashion, Electronics) gated by HSN chapter
  - Tier 3: Noise-filtered catch-all attributes JSON
"""

import re
from typing import Dict, List, Optional, Any, Tuple
from difflib import SequenceMatcher


class ColumnResolver:
    """
    Standardizes heterogeneous column headers into canonical schema field names.
    Supports domain-agnostic multi-tier resolution with HSN-based vertical inference.
    """

    # Tier 1: Universal statutory Indian GST invoice & core inventory headers
    CORE_CANONICAL_MAPPINGS: Dict[str, List[str]] = {
        "item_id": [
            "id", "item_id", "sku", "code", "product_code", "item_code", "barcode", "sku_id",
            "sku_code", "product_id"
        ],
        "item_name": [
            "item", "item_name", "product", "product_name", "product_title", "description", "particulars",
            "title", "name", "goods"
        ],
        "quantity": [
            "qty", "quantity", "count", "units", "pcs", "number_of_items", "item_count",
            "volume", "num_units", "pieces"
        ],
        "unit_price": [
            "price", "unit_price", "rate", "unit_cost", "cost_per_unit", "price_per_unit",
            "per_unit", "rate_per_unit", "unit_price_(inr)", "unit_cost_(inr)", "rate_(inr)"
        ],
        "line_total": [
            "total", "line_total", "amount", "total_amount", "subtotal", "val",
            "net_amount", "total_price"
        ],
        "current_stock": [
            "stock", "current_stock", "on_hand", "qty_available", "stock_available",
            "available_stock", "inventory_count", "in_stock", "balance", "balance_(units)"
        ],
        "min_threshold": [
            "min_threshold", "reorder_point", "min_stock", "safety_stock", "safety_reserve",
            "min_qty", "threshold", "minimum_stock", "reorder_limit"
        ],
        "reorder_quantity": [
            "reorder_quantity", "reorder_qty", "order_qty", "suggested_reorder",
            "restock_qty", "batch_size"
        ],
        "supplier_name": [
            "supplier", "supplier_name", "vendor", "vendor_name", "biller", "merchant",
            "seller", "party_name"
        ],
        "invoice_id": ["invoice_no", "invoice_id", "bill_no", "receipt_no"],
        "invoice_date": ["invoice_date", "date", "bill_date"],
        "supplier_gstin": ["gst_reg_no", "supplier_gstin", "gstin", "bill_to_gst_reg_no"],
        "customer_gstin": ["ship_to_gst_reg_no", "customer_gstin", "buyer_gstin"],
        "customer_name": ["bill_to", "customer_name", "buyer_name", "party_name", "buyer", "customer", "client"],
        "po_number": ["cust_po", "po_number", "purchase_order_no", "order_no"],
        "hsn_sac": ["hsn_sac", "hsn", "sac", "hsn/sac", "tariff_code", "commodity_code", "hsn_code", "tariff"],
        "tax_rate_pct": ["rate", "tax_rate_pct", "gst_rate", "tax_rate"],
        "tax_amount": ["tax_amount", "igst", "cgst", "sgst", "gst_amount"],
        "grand_total": ["grand_total", "total", "net_amount", "amount_payable"],
        "payment_terms": ["payment_terms", "terms", "payment_terms_days"],
    }

    # Backward compatibility alias
    CANONICAL_MAPPINGS = CORE_CANONICAL_MAPPINGS

    # Tier 2: Domain extension packs
    DOMAIN_EXTENSIONS: Dict[str, Dict[str, List[str]]] = {
        "food": {
            "batch_number": ["batch_no", "batch_number", "lot_no", "lot_number", "batch"],
            "expiry_date": ["expiry_date", "exp_date", "use_by", "best_before", "expiry"],
            "manufacture_date": ["mfg_date", "manufacture_date", "packed_on", "mfg"],
            "storage_temp": ["storage_temp", "storage_condition", "temp_req", "temperature"],
        },
        "fashion": {
            "size": ["size", "size_variant", "garment_size"],
            "color": ["color", "colour", "shade", "color_variant"],
            "material": ["material", "fabric", "fabric_type", "composition", "cloth"],
            "season": ["season", "collection", "seasonality"],
        },
        "electronics": {
            "serial_number": ["serial_no", "serial_number", "imei", "device_id", "serial"],
            "warranty_months": ["warranty", "warranty_period", "warranty_months"],
            "model_number": ["model_no", "model_number", "model"],
        },
    }

    # Semantic domain keywords for vertical inference when HSN codes are absent (e.g. international/non-GST)
    DOMAIN_SEMANTIC_KEYWORDS: Dict[str, List[str]] = {
        "fashion": [
            "shirt", "tshirt", "t-shirt", "jeans", "skirt", "sweater", "sneakers", "dress",
            "garment", "fabric", "cloth", "apparel", "cotton", "silk", "denim", "trousers",
            "jacket", "pants", "kurti", "saree", "suit", "shoes", "wear", "clothing",
            "linen", "polyester", "blouse", "hoodie", "textile", "wool", "woolen",
            "leather", "top", "leggings", "scarf", "socks", "blazer", "fashion"
        ],
        "food": [
            "rice", "wheat", "flour", "oil", "milk", "dairy", "cheese", "butter", "spice",
            "masala", "grain", "pulse", "dal", "sugar", "salt", "tea", "coffee", "biscuit",
            "snack", "fruit", "vegetable", "meat", "fish", "grocery", "edible", "juice",
            "beverage", "sauce", "pasta", "noodle", "curry", "bread", "chocolate", "organic"
        ],
        "electronics": [
            "laptop", "desktop", "monitor", "charger", "adapter", "battery", "cpu", "gpu",
            "ram", "ssd", "hdd", "cable", "mouse", "keyboard", "phone", "smartphone",
            "headphone", "server", "pcb", "display", "processor", "tablet", "dell",
            "hardware", "switch", "router", "motherboard", "semiconductor", "camera"
        ],
    }

    SYSTEM_METADATA_COLUMNS = {"document_text", "verification_status"}

    @classmethod
    def normalize_header(cls, raw_header: str) -> str:
        """Clean and normalize header string."""
        return raw_header.strip().lower().replace(" ", "_").replace("-", "_").replace(".", "")

    @classmethod
    def is_valid_attribute_header(cls, raw_header: str) -> bool:
        """
        Lightweight noise filter before admitting into catch-all attributes:
        Rejects empty/whitespace, pure punctuation, or non-majority alphanumeric headers.
        """
        h = raw_header.strip()
        if not h:
            return False
        alnum_count = sum(1 for c in h if c.isalnum())
        # Must have at least one alphanumeric character and be at least 50% alphanumeric
        return alnum_count > 0 and (alnum_count / len(h)) >= 0.5

    @classmethod
    def get_vertical_for_hsn(cls, hsn_val: Any) -> str:
        """Derives business vertical from a single HSN/SAC code."""
        if not hsn_val:
            return "general"
        clean = re.sub(r'[^0-9]', '', str(hsn_val).strip())
        if len(clean) >= 2:
            try:
                chap = int(clean[:2])
                if 1 <= chap <= 24:
                    return "food"
                elif 50 <= chap <= 63:
                    return "fashion"
                elif chap in (84, 85):
                    return "electronics"
            except ValueError:
                pass
        return "general"

    @classmethod
    def infer_vertical_from_hsn_values(cls, hsn_values: List[Any]) -> str:
        """
        Computes majority business vertical across all line items in a batch.
        Guarantees majority-voting rather than first-row bias.
        """
        from collections import Counter
        vertical_counts = Counter()
        for val in hsn_values:
            v = cls.get_vertical_for_hsn(val)
            if v != "general":
                vertical_counts[v] += 1
        if vertical_counts:
            return vertical_counts.most_common(1)[0][0]
        return "general"

    @classmethod
    def infer_vertical_from_content(cls, raw_rows: List[Dict[str, Any]]) -> str:
        """
        Infers business vertical from row content (item names, descriptions, or OCR document text)
        when statutory HSN codes are absent (e.g. international invoices, non-GST documents).
        """
        from collections import Counter
        scores = Counter()

        text_corpus_tokens = []
        for r in raw_rows:
            for k, val in r.items():
                if val and isinstance(val, str):
                    text_corpus_tokens.append(val.lower())

        corpus_text = " " + " ".join(text_corpus_tokens) + " "
        for vertical, keywords in cls.DOMAIN_SEMANTIC_KEYWORDS.items():
            for kw in keywords:
                pattern = r'\b' + re.escape(kw) + r'\b'
                matches = len(re.findall(pattern, corpus_text))
                if matches > 0:
                    scores[vertical] += matches

        if scores:
            top_vertical, top_count = scores.most_common(1)[0]
            if top_count >= 1:
                return top_vertical

        return "general"

    @classmethod
    def _execute_two_pass_matching(
        cls,
        candidate_headers: List[str],
        mapping_dict: Dict[str, List[str]],
        used_headers: set,
        threshold: int = 70
    ) -> Dict[str, Dict[str, Any]]:
        """
        Executes standard two-pass matching (Pass 1: 100% exact, Pass 2: fuzzy >= threshold)
        against an arbitrary canonical mapping dictionary.
        """
        def similarity_score(s1: str, s2: str) -> int:
            return int(SequenceMatcher(None, s1.lower(), s2.lower()).ratio() * 100)

        results: Dict[str, Dict[str, Any]] = {}

        # Sub-pass 1: Exact matches (100% confidence)
        for canonical_field, synonyms in mapping_dict.items():
            for raw_col in candidate_headers:
                if raw_col in used_headers:
                    continue
                norm_col = cls.normalize_header(raw_col)
                if norm_col in synonyms or norm_col == canonical_field:
                    results[canonical_field] = {
                        "suggested": raw_col,
                        "confidence": 100,
                        "alternatives": [],
                        "ambiguous": False
                    }
                    used_headers.add(raw_col)
                    break

        # Sub-pass 2: Fuzzy matches for remaining canonical fields
        for canonical_field, synonyms in mapping_dict.items():
            if canonical_field in results:
                continue
            candidates = []
            for raw_col in candidate_headers:
                if raw_col in used_headers:
                    continue
                norm_col = cls.normalize_header(raw_col)
                norm_tokens = set(norm_col.split('_'))

                # Semantic discriminator guards to avoid false suffix bleed
                if canonical_field == "po_number" and not any(t in norm_tokens for t in ("po", "order", "purchase")):
                    continue
                if canonical_field == "item_id" and not any(t in norm_tokens for t in ("id", "sku", "code", "barcode", "key")):
                    continue

                syn_scores = [similarity_score(norm_col, syn) for syn in synonyms]
                can_score = similarity_score(norm_col, canonical_field)
                score = max(syn_scores + [can_score]) if syn_scores else can_score

                if score >= threshold:
                    candidates.append((raw_col, score))

            candidates.sort(key=lambda x: x[1], reverse=True)

            if candidates:
                is_ambig = len(candidates) > 1 and (candidates[0][1] - candidates[1][1] < 10)
                results[canonical_field] = {
                    "suggested": candidates[0][0],
                    "confidence": candidates[0][1],
                    "alternatives": [c[0] for c in candidates[1:]],
                    "ambiguous": is_ambig
                }
                used_headers.add(candidates[0][0])

        return results

    @classmethod
    def resolve_columns_multi_tier(
        cls,
        raw_columns: List[str],
        raw_rows: Optional[List[Dict[str, Any]]] = None,
        explicit_vertical: Optional[str] = None
    ) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, str], str]:
        """
        Executes multi-tier column resolution in strict sequence:
          1. Core Resolution: Resolves CORE_CANONICAL_MAPPINGS (exact + fuzzy), discovering hsn_sac.
          2. Vertical Determination: Inferred via majority HSN vote from resolved hsn_sac column values across raw_rows.
          3. Extension Resolution: Resolves DOMAIN_EXTENSIONS[detected_vertical] with same exact+fuzzy matcher.
          4. Noise-Filtered Catch-All: Remaining valid columns mapped to 'attr:<snake_case_key>'.

        Returns:
          (mapping_metadata, raw_to_canonical_map, detected_vertical)
        """
        used_headers = set()
        raw_to_canonical: Dict[str, str] = {}
        mapping_metadata: Dict[str, Dict[str, Any]] = {}

        # ── 1. Pass 1: Core Canonical Resolution ──
        non_system_headers = [c for c in raw_columns if c not in cls.SYSTEM_METADATA_COLUMNS]
        core_mapping = cls._execute_two_pass_matching(
            candidate_headers=non_system_headers,
            mapping_dict=cls.CORE_CANONICAL_MAPPINGS,
            used_headers=used_headers,
            threshold=70
        )
        for canon, meta in core_mapping.items():
            mapping_metadata[canon] = meta
            if meta.get("suggested"):
                raw_to_canonical[meta["suggested"]] = canon

        # ── 2. Authoritative Vertical Determination ──
        if explicit_vertical and explicit_vertical in cls.DOMAIN_EXTENSIONS:
            detected_vertical = explicit_vertical
        elif explicit_vertical == "general":
            detected_vertical = "general"
        else:
            # Step A: HSN Chapter Range (Primary Deterministic)
            hsn_raw_col = core_mapping.get("hsn_sac", {}).get("suggested")
            hsn_values = []
            if hsn_raw_col and raw_rows:
                for r in raw_rows:
                    val = r.get(hsn_raw_col)
                    if val is not None and str(val).strip():
                        hsn_values.append(val)
            detected_vertical = cls.infer_vertical_from_hsn_values(hsn_values)

            # Step B: Line-item / Content Semantic Lexicon (Fallback if HSN is absent)
            if detected_vertical == "general" and raw_rows:
                detected_vertical = cls.infer_vertical_from_content(raw_rows)

        # ── 3. Pass 2: Extension Canonical Resolution ──
        if detected_vertical in cls.DOMAIN_EXTENSIONS:
            ext_dict = cls.DOMAIN_EXTENSIONS[detected_vertical]
            unclaimed_headers = [c for c in non_system_headers if c not in used_headers]
            ext_mapping = cls._execute_two_pass_matching(
                candidate_headers=unclaimed_headers,
                mapping_dict=ext_dict,
                used_headers=used_headers,
                threshold=70
            )
            for canon_ext, meta in ext_mapping.items():
                mapping_metadata[canon_ext] = meta
                if meta.get("suggested"):
                    # Keyed by clean canonical extension field name (e.g. "material", "size")
                    raw_to_canonical[meta["suggested"]] = canon_ext

        # ── 4. Pass 3: System Columns & Noise-Filtered Catch-All Attributes ──
        for col in raw_columns:
            if col in cls.SYSTEM_METADATA_COLUMNS:
                raw_to_canonical[col] = "[system]"
                mapping_metadata[col] = {
                    "suggested": col,
                    "confidence": 100,
                    "alternatives": [],
                    "ambiguous": False
                }
            elif col not in used_headers:
                if cls.is_valid_attribute_header(col):
                    attr_key = re.sub(r'[^a-z0-9_]', '', cls.normalize_header(col)).strip('_')
                    if not attr_key:
                        attr_key = "custom_attribute"
                    canonical_repr = f"attr:{attr_key}"
                    raw_to_canonical[col] = canonical_repr
                    mapping_metadata[canonical_repr] = {
                        "suggested": col,
                        "confidence": 100,
                        "alternatives": [],
                        "ambiguous": False
                    }
                    used_headers.add(col)
                else:
                    # Garbage / noise header (e.g. '###---###' or blank) - left unmapped
                    raw_to_canonical[col] = None

        return mapping_metadata, raw_to_canonical, detected_vertical

    @classmethod
    def suggest_column_mapping(
        cls,
        raw_columns: List[str],
        threshold: int = 70,
        raw_rows: Optional[List[Dict[str, Any]]] = None,
        explicit_vertical: Optional[str] = None
    ) -> Dict[str, Dict[str, Any]]:
        """
        Backward-compatible method returning mapping metadata dict.
        """
        mapping, _, _ = cls.resolve_columns_multi_tier(
            raw_columns=raw_columns,
            raw_rows=raw_rows,
            explicit_vertical=explicit_vertical
        )
        return mapping

    @classmethod
    def resolve_columns(cls, raw_columns: List[str], **kwargs) -> Dict[str, Dict[str, Any]]:
        """Backward compatibility alias for suggest_column_mapping."""
        return cls.suggest_column_mapping(raw_columns, **kwargs)
