import pandas as pd
import numpy as np
import logging

# Configure basic logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def load_csv_data(filepath):
    """
    Utility function to load CSV data and perform basic validation.
    """
    try:
        logger.info(f"Attempting to load data from {filepath}...")
        df = pd.read_csv(filepath)
        logger.info(f"Data loaded successfully. Shape: {df.shape}")
        
        # Basic data cleaning: strip whitespace from column names
        df.columns = df.columns.str.strip()
        
        return df
    except FileNotFoundError:
        logger.error(f"File not found: {filepath}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error loading data: {e}")
        return None

def get_basic_stats(df):
    """
    Returns basic descriptive statistics for the numerical columns.
    """
    if df is not None and not df.empty:
        return df.describe()
    return None

if __name__ == "__main__":
    # Placeholder for local testing
    logger.info("Data loader module initialized. Ready for ingestion.")
    pass
