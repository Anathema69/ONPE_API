@echo off
cd /d "%~dp0"
"%~dp0venv\Scripts\pythonw.exe" "%~dp0scrape_onpe.py" >> "%~dp0data\scheduler.log" 2>&1
