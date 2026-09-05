"""
Intelligent Header & Synonym Resolver for SME Data Digitalization.
Resolves column header variance across heterogeneous Excel, CSV, and text document layouts.
"""

from typing import Dict, List, Optional


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
            "per_unit", "rate_per_unit"
        ],
        "line_total": [
            "total", "line_total", "amount", "total_amount", "subtotal", "val",
            "net_amount", "total_price"
        ],
        "current_stock": [
            "stock", "current_stock", "on_hand", "qty_available", "available_stock",
            "inventory_count", "in_stock", "balance"
        ],
        "min_threshold": [
            "min_threshold", "reorder_point", "min_stock", "safety_stock", "min_qty",
            "threshold", "minimum_stock"
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
