@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1

where npm.cmd >nul 2>&1
if errorlevel 1 goto missing_dependencies
if not exist "node_modules\.bin\vite.cmd" goto missing_dependencies

call npm.cmd run package:dev
set "package_result=%errorlevel%"
if not "%package_result%"=="0" echo Packaging failed. Check the error above.
goto done

:missing_dependencies
echo Run install-dependencies.bat first, then run this file again.
set "package_result=1"

:done
popd
if /i not "%~1"=="--no-pause" pause
exit /b %package_result%
