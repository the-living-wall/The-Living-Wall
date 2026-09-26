@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" goto check_env
if exist ".venv" goto incompatible_env
py -3.12 -c "import struct,sys; sys.exit(0 if struct.calcsize('P') == 8 else 1)"
if errorlevel 1 goto missing_python
py -3.12 -m venv .venv
if errorlevel 1 goto failed
:check_env
".venv\Scripts\python.exe" -c "import struct,sys; sys.exit(0 if sys.version_info[:2] == (3,12) and struct.calcsize('P') == 8 else 1)"
if errorlevel 1 goto incompatible_env
".venv\Scripts\python.exe" -m pip install --only-binary=:all: -r requirements.txt
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -c "import numpy, cv2, pyorbbecsdk"
if errorlevel 1 goto failed
echo Ready. Close Orbbec Viewer before starting the depth lab.
if /I not "%~1"=="--no-pause" pause
exit /b 0
:missing_python
echo Install Python 3.12 x64 with the Python launcher, then retry.
goto failed
:incompatible_env
echo Existing .venv is incompatible. Move it aside manually, then retry.
echo Required: Windows Python 3.12 x64. Do not reuse a copied Mac environment.
goto failed
:failed
echo Setup failed. See the error above and README.md. Existing files were not removed.
if /I not "%~1"=="--no-pause" pause
exit /b 1
