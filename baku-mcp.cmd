@echo off
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "%~dp0app\tools\mcp.mjs" %*
exit /b %errorlevel%
