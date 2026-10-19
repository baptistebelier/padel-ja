@echo off
chcp 65001 >nul
title Padel JA - serveur
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js n'est pas installe. Telechargez-le sur https://nodejs.org ^(version LTS^), puis relancez.
  echo.
  pause
  exit /b
)
rem Ouvre l'editeur en mode application (fenetre sans barre d'adresse)
start "" /b cmd /c "timeout /t 1 >nul & (start msedge --app=http://localhost:3737/app || start http://localhost:3737/app)"
node server.js
pause
