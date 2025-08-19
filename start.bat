@echo off
setlocal EnableDelayedExpansion

echo Starting BGCS Ground Control Station...

REM Clean up any previous processes first
call :CLEANUP_PROCESSES

REM Activate virtual environment
call .bgcs_env\Scripts\activate
if errorlevel 1 (
    echo Error: Failed to activate virtual environment
    echo Please run: python -m venv .bgcs_env
    pause
    exit /b 1
)

echo.
echo BGCS server starting on http://localhost:8000
echo Press Ctrl+C to stop the server
echo.

REM Start uvicorn in foreground - this allows Ctrl+C to work naturally
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

REM When we reach here, uvicorn has been stopped (Ctrl+C or error)
echo.
echo Server stopped. Cleaning up...
call :CLEANUP_PROCESSES
echo BGCS shutdown complete.
pause
exit /b 0

:CLEANUP_PROCESSES
REM Silent cleanup of any existing processes
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000"') do (
    if not "%%a"=="" if not "%%a"=="0" (
        taskkill /f /pid %%a >nul 2>&1
    )
)

REM Also kill any uvicorn processes by command line
wmic process where "commandline like '%%uvicorn%%' and commandline like '%%backend.main%%'" delete >nul 2>&1
goto :eof