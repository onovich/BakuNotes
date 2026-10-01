@echo off
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "%~dp0app\tools\baku.mjs" %*
exit /b %errorlevel%
