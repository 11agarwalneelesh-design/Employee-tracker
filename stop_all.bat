@echo off
:: Forcefully terminate the backend server and network tunnel
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
:: Kill any lingering command prompt instances running the servers
taskkill /F /FI "WINDOWTITLE eq Operational Tracker Master Autostart" >nul 2>&1
taskkill /F /IM cmd.exe /FI "STATUS eq RUNNING" >nul 2>&1
exit