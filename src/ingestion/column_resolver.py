"""
Intelligent Header & Synonym Resolver for SME Data Digitalization.
Resolves column header variance across heterogeneous Excel, CSV, and text document layouts.
"""

from typing import Dict, List, Optional, Any


class ColumnResolver:
    """
    Standardizes heterogeneous column headers into canonical schema field names.
    """

    CANONICAL_MAPPINGS: Dict[str, List[str]] = {
        "item_id": [
            "id", "item_id", "sku", "code", "product_code", "item_code", "barcode", "sku_id"
        ],
        "item_name": [
            "item", "item_name", "product", "product_name", "description", "particulars",
            "title", "name", "material", "goods"
        ],
        "quantity": [
            "qty", "quantity", "count", "units", "pcs", "number_of_items", "item_count",
            "volume", "num_units", "pieces"
        ],
        "unit_price": [
            "price", "unit_price", "rate", "unit_cost", "cost_per_unit", "price_per_unit",
            "per_unit", "rate_per_unit", "unit_price_(inr)", "unit_cost_(inr)"
        ],
        "line_total": [
            "total", "line_total", "amount", "total_amount", "subtotal", "val",
            "net_amount", "total_price"
        ],
        "current_stock": [
            "stock", "current_stock", "on_hand", "qty_available", "stock_available",
            "available_stock", "inventory_count", "in_stock", "balance"
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
        ]
    }

    @classmethod
    def normalize_header(cls, raw_header: str) -> str:
        """Clean and normalize header string."""
        return raw_header.strip().lower().replace(" ", "_").replace("-", "_").replace(".", "")

    @classmethod
    def resolve_columns(cls, raw_columns: List[str]) -> Dict[str, str]:
        """
        Maps a list of raw column headers to canonical field names.
        
        :param raw_columns: Raw column header strings.
        :return: Dict mapping raw_column_name -> canonical_field_name.
        """
        mapped_dict: Dict[str, str] = {}

        for raw_col in raw_columns:
            norm_col = cls.normalize_header(raw_col)
            found = False

            for canonical_name, synonyms in cls.CANONICAL_MAPPINGS.items():
                if norm_col in synonyms or norm_col == canonical_name:
                    mapped_dict[raw_col] = canonical_name
                    found = True
                    break

            if not found:
                mapped_dict[raw_col] = norm_col

        return mapped_dict

    @classmethod
    def suggest_column_mapping(cls, raw_columns: List[str], threshold: int = 60) -> Dict[str, Dict[str, Any]]:
        """
        Suggests field mapping with confidence scores and ambiguity flags.
        Surfaces ties/alternatives when top candidates score closely.
        """
        from difflib import SequenceMatcher

        def similarity_score(s1: str, s2: str) -> int:
            return int(SequenceMatcher(None, s1.lower(), s2.lower()).ratio() * 100)

        mapping: Dict[str, Dict[str, Any]] = {}
        used_columns = set()

        for canonical_field, synonyms in cls.CANONICAL_MAPPINGS.items():
            candidates = []
            for raw_col in raw_columns:
                if raw_col in used_columns:
                    continue
                norm_col = cls.normalize_header(raw_col)
                # Exact synonym match gets 100
                if norm_col in synonyms or norm_col == canonical_field:
                    score = 100
                else:
                    score = max([similarity_score(norm_col, syn) for syn in synonyms] + [similarity_score(norm_col, canonical_field)])
                
                if score >= threshold:
                    candidates.append((raw_col, score))

            candidates.sort(key=lambda x: x[1], reverse=True)

            if not candidates:
                mapping[canonical_field] = {"suggested": None, "confidence": 0, "alternatives": [], "ambiguous": False}
            elif len(candidates) > 1 and (candidates[0][1] - candidates[1][1] < 10):
                mapping[canonical_field] = {
                    "suggested": candidates[0][0],
                    "confidence": candidates[0][1],
                    "alternatives": [c[0] for c in candidates[1:]],
                    "ambiguous": True
                }
            else:
                mapping[canonical_field] = {
                    "suggested": candidates[0][0],
                    "confidence": candidates[0][1],
                    "alternatives": [],
                    "ambiguous": False
                }
                used_columns.add(candidates[0][0])

        return mapping
