@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Editor del album
where node >nul 2>&1
if errorlevel 1 (
  echo Falta Node.js. Instalalo desde https://nodejs.org y vuelve a intentar.
  pause
  exit /b 1
)
node servidor.js
pause
