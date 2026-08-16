@echo off
title NovaFlix - Starting Application
color 0A

echo ===================================================
echo             🎬 Starting NovaFlix 🚀            
echo ===================================================
echo.

echo [1/2] Starting Python FastAPI Backend Server (Port 8000)...
start "NovaFlix Backend Server" cmd /k "cd /d %~dp0 && python -m uvicorn main:application --port 8000 --reload"

echo [2/2] Starting Vite Frontend Dev Server (Port 5173)...
start "NovaFlix Frontend Dev" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ===================================================
echo   NovaFlix servers launched successfully!
echo   - Backend API: http://127.0.0.1:8000
echo   - Frontend App: http://localhost:5173
echo ===================================================
echo.

timeout /t 3 /nobreak >nul
start http://localhost:5173

exit
