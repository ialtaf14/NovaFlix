@echo off
title NovaFlix Launcher
echo ==============================================
echo              Launching NovaFlix
echo ==============================================
echo.

echo [1/2] Launching Backend Server (FastAPI on Port 8000)...
start "NovaFlix Backend" cmd /c "%~dp0start-backend.bat"

echo [2/2] Launching Frontend Server (Vite on Port 5173)...
start "NovaFlix Frontend" cmd /c "%~dp0..\frontend\start-frontend.bat"

echo.
echo ==============================================
echo   Both servers have been launched successfully!
echo.
echo   - Frontend: http://localhost:5173
echo   - Backend:  http://localhost:8000
echo ==============================================
echo.
pause
