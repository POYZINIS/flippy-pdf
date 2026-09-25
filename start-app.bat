@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1

where node >nul 2>&1
if errorlevel 1 goto missing_dependencies
if not exist "node_modules\electron\dist\electron.exe" goto missing_dependencies
if not exist "dist\index.html" goto missing_build

node scripts\desktop.mjs %*
set "start_result=%errorlevel%"
if not "%start_result%"=="0" pause
goto done

:missing_dependencies
echo Run install-dependencies.bat first, then run this file again.
set "start_result=1"
pause
goto done

:missing_build
echo Run npm run build first, then run this file again.
set "start_result=1"
pause

:done
popd
exit /b %start_result%
