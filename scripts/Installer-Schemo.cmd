@echo off
rem Installe Schemo sur ce PC : copie l'exe dans %LOCALAPPDATA%\Programs\Schemo,
rem cree le raccourci sur le bureau, puis lance Schemo. A relancer pour mettre a jour.
setlocal
set "SRC=%~dp0Schemo.exe"
set "DEST=%LOCALAPPDATA%\Programs\Schemo"
if not exist "%SRC%" (
  echo Schemo.exe introuvable a cote de ce fichier.
  pause
  exit /b 1
)
echo Copie de Schemo sur ce PC...
if not exist "%DEST%" mkdir "%DEST%"
copy /y "%SRC%" "%DEST%\Schemo.exe" >nul
if errorlevel 1 (
  echo La copie a echoue. Schemo est peut-etre ouvert : ferme-le et recommence.
  pause
  exit /b 1
)
set "EXE=%DEST%\Schemo.exe"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $n='Sch'+[char]0xE9+'mo.lnk'; $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d $n)); $s.TargetPath=$env:EXE; $s.WorkingDirectory=$env:DEST; $s.IconLocation=$env:EXE+',0'; $s.Description='Schemo'; $s.Save()"
if errorlevel 1 (
  echo Le raccourci n'a pas pu etre cree, mais Schemo est installe dans %DEST%.
  pause
  exit /b 1
)
echo Schemo est installe et le raccourci est sur ton bureau.
start "" "%EXE%"
timeout /t 3 >nul
