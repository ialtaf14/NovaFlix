@echo off
echo ================================
echo   NovaFlix Backend (FastAPI)
echo ================================
cd /d "%~dp0"
.venv\Scripts\python.exe -m uvicorn main:application --reload --port 8000 --host 0.0.0.0
