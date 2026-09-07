"""Uvicorn entrypoint: `python main.py` runs the FastAPI app locally."""

import uvicorn

if __name__ == "__main__":
    uvicorn.run("src.api:app", host="0.0.0.0", port=8000, reload=True)
