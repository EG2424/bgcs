@echo off
echo Stopping BGCS Ground Control Station...

REM Kill all Python processes related to uvicorn
echo Stopping uvicorn processes...
taskkill /f /im python.exe /fi "commandline eq *uvicorn*" >nul 2>&1

REM Kill any processes using port 8000
echo Freeing port 8000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" 2^>nul') do (
    if not "%%a"=="0" (
        echo Killing process %%a
        taskkill /f /pid %%a >nul 2>&1
    )
)

echo BGCS stopped successfully.
pause