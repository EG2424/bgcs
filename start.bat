@echo off
setlocal EnableDelayedExpansion

echo Starting BGCS Ground Control Station...

REM Activate virtual environment
call .bgcs_env\Scripts\activate
if errorlevel 1 (
    echo Error: Failed to activate virtual environment
    echo Please run: python -m venv .bgcs_env
    pause
    exit /b 1
)

echo Starting BGCS server...

REM Start uvicorn server in foreground so Ctrl+C will work
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

REM This cleanup section runs when Ctrl+C is pressed or server stops
echo.
echo Cleaning up processes...

REM Kill any remaining python processes that might be related to uvicorn
taskkill /f /im python.exe /fi "commandline eq *uvicorn*" >nul 2>&1

REM Kill any processes still using port 8000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" 2^>nul') do (
    if not "%%a"=="0" (
        taskkill /f /pid %%a >nul 2>&1
    )
)

echo BGCS shutdown complete.
exit /b 0