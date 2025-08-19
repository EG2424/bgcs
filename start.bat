@echo off
echo Starting BGCS Ground Control Station...
call .bgcs_env\Scripts\activate
start /b python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
timeout /t 2 >nul
start http://localhost:8000
echo BGCS is running at http://localhost:8000
echo Press Ctrl+C to stop the server