"""
One-Click Demonstration Launcher for MSME Multi-Agent Platform.
Starts both the FastAPI Backend (Port 8000) and the React/Vite Frontend (Port 5173).
"""

import os
import sys
import subprocess
import time
import webbrowser
import socket

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(ROOT_DIR, "frontend")


if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass


def kill_port_owner(port: int):
    """Frees port if occupied by previous background process on Windows."""
    try:
        if os.name == "nt":
            cmd = f'powershell -Command "Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}"'
            subprocess.run(cmd, shell=True, capture_output=True)
    except Exception:
        pass


def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0


def main():
    print("=" * 80)
    print(" [*] STARTING MSME MULTI-AGENT OPERATIONS PLATFORM")
    print("=" * 80)
    print(f" Working Directory: {ROOT_DIR}")

    # Free ports 8000 and 5173 if occupied
    print("\n[Init] Ensuring ports 8000 and 5173 are free...")
    kill_port_owner(8000)
    kill_port_owner(5173)
    time.sleep(1)

    # 1. Start FastAPI Backend
    print("\n[1/2] Starting FastAPI Backend on http://127.0.0.1:8000 ...")
    backend_cmd = [
        sys.executable, "-m", "uvicorn", "src.api.main:app",
        "--host", "127.0.0.1", "--port", "8000", "--reload"
    ]
    backend_proc = subprocess.Popen(backend_cmd, cwd=ROOT_DIR)

    # Wait for backend to come up
    for _ in range(15):
        if is_port_in_use(8000):
            print("  [+] Backend is live!")
            break
        time.sleep(0.5)

    # 2. Start Vite Frontend
    print("[2/2] Starting Vite Frontend on http://localhost:5173 ...")
    npm_cmd = "npm run dev -- --host 127.0.0.1 --port 5173" if os.name != "nt" else "npm.cmd run dev -- --host 127.0.0.1 --port 5173"
    frontend_proc = subprocess.Popen(npm_cmd, cwd=FRONTEND_DIR, shell=True)

    print("\n" + "=" * 80)
    print(" [+] MULTI-AGENT SYSTEM IS LIVE & OPERATIONAL!")
    print(" [*] Frontend Dashboard: http://localhost:5173")
    print(" [*] Backend API Docs:   http://127.0.0.1:8000/docs")
    print(" Press Ctrl+C in this terminal to stop both servers.")
    print("=" * 80 + "\n")

    time.sleep(2)
    try:
        webbrowser.open("http://localhost:5173")
    except Exception:
        pass

    try:
        backend_proc.wait()
    except KeyboardInterrupt:
        print("\nStopping servers...")
        backend_proc.terminate()
        frontend_proc.terminate()


if __name__ == "__main__":
    main()
