@echo off
chcp 65001 >nul
cd /d "%~dp0"
set GIT="C:\Program Files\Git\cmd\git.exe"
echo Subiendo la revista a GitHub...
%GIT% add -A
%GIT% commit -m "Actualizar revista" >nul 2>&1
%GIT% push
if errorlevel 1 (
  echo.
  echo No se pudo subir. Si es la primera vez, conecta el repo de GitHub ^(mira LEEME.md^).
) else (
  echo.
  echo Listo. En uno o dos minutos se ve en la pagina.
)
pause
