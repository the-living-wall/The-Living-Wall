@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" goto missing_env
".venv\Scripts\python.exe" server.py --open %*
set "lab_exit=%errorlevel%"
if not "%lab_exit%"=="0" pause
exit /b %lab_exit%
:missing_env
echo Run the installation batch file in this folder first. See README.md.
pause
exit /b 1
