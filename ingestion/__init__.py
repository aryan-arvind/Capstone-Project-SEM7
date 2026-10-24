"""
MSME Data Ingestion & Digitalization Module.
Provides schema validation, multi-tier column resolution, text/OCR parsing, and SQLite staging.
"""
import sys
import types

# 1. Create early namespace mappings so relative and absolute 'src.ingestion.*' imports resolve
src_mod = types.ModuleType('src')
src_ingest_mod = sys.modules[__name__]
src_mod.ingestion = src_ingest_mod
sys.modules['src'] = src_mod
sys.modules['src.ingestion'] = src_ingest_mod

# 2. Import core schemas and column resolvers
from . import schemas
sys.modules['src.ingestion.schemas'] = schemas

from . import column_resolver
sys.modules['src.ingestion.column_resolver'] = column_resolver

from . import heuristics
sys.modules['src.ingestion.heuristics'] = heuristics

from . import database
sys.modules['src.ingestion.database'] = database

src_core_mod = types.ModuleType('src.core')
src_core_mod.database = database
src_mod.core = src_core_mod
sys.modules['src.core'] = src_core_mod
sys.modules['src.core.database'] = database

# 3. Import cascade and digitalizer engine
from . import cascade
sys.modules['src.ingestion.cascade'] = cascade

from . import digitalizer
sys.modules['src.ingestion.digitalizer'] = digitalizer
