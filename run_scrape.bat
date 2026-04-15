@echo off
REM Task programado cada 25 min: scrape ONPE + deploy condicional a Vercel.
REM  1) scrape_onpe.py actualiza data/onpe_latest.json y data/onpe_history.csv
REM  2) check_and_deploy.py compara actualizadoAl vs .last_deployed y si
REM     cambio hace npm run build + vercel deploy --prod.
cd /d "%~dp0"

REM --- 1. scrape ---
"%~dp0venv\Scripts\pythonw.exe" "%~dp0scrape_onpe.py" >> "%~dp0data\scheduler.log" 2>&1

REM --- 2. deploy condicional ---
"%~dp0venv\Scripts\python.exe" "%~dp0scripts\check_and_deploy.py" >> "%~dp0data\scheduler.log" 2>&1
