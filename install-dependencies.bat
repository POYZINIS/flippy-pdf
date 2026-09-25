@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1

where node >nul 2>&1
if errorlevel 1 goto missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto missing_node
node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)"
if errorlevel 1 goto missing_node

echo Installing project and development dependencies...
call npm.cmd install --include=dev
if errorlevel 1 goto failed

echo Installing the Electron desktop runtime...
node node_modules\electron\install.js
if errorlevel 1 goto failed

echo Installing Chromium for tests and icon generation...
call node_modules\.bin\playwright.cmd install chromium
if errorlevel 1 goto failed

echo.
echo Dependencies installed.
echo Run npm run desktop for the desktop app, or npm run dev for the browser app.
set "install_result=0"
goto done

:missing_node
echo.
echo Install Node.js 22.12 or newer with npm from https://nodejs.org/
echo Then reopen this batch file.
set "install_result=1"
goto done

:failed
echo.
echo Installation failed. Check the error above, then run this file again.
set "install_result=1"

:done
popd
if /i not "%~1"=="--no-pause" pause
exit /b %install_result%
