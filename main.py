"""
Uvicorn entrypoint: `python main.py` runs the FastAPI app locally.
"""

import os
import sys
import uvicorn

project_root = os.path.dirname(os.path.abspath(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

if __name__ == "__main__":
    print(f"Starting Capstone Multi-Agent API server at http://127.0.0.1:8000 ...")
    print(f"Swagger Documentation available at: http://127.0.0.1:8000/docs")
    uvicorn.run("src.api:app", host="127.0.0.1", port=8000, reload=True, app_dir=project_root)
