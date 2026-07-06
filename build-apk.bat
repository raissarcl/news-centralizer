@echo off
setlocal EnableDelayedExpansion

echo === News Centralizer APK Build ===

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

REM Junction C:\nc -> project gives short paths for CMake (Windows 260-char limit).
set "LINK=C:\nc"
set "BUILD_ROOT=%ROOT%"

if exist "%LINK%\package.json" (
  for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "(Get-Item -LiteralPath '%LINK%').Target"`) do set "LINK_TARGET=%%T"
  if /i "!LINK_TARGET!"=="%ROOT%" set "BUILD_ROOT=%LINK%"
)

if /i not "%BUILD_ROOT%"=="%LINK%" (
  if not exist "%LINK%" (
    echo [0/3] Creating junction %LINK% -^> %ROOT%
    mklink /J "%LINK%" "%ROOT%" >nul 2>&1
    if exist "%LINK%\package.json" set "BUILD_ROOT=%LINK%"
  )
)

if /i not "%BUILD_ROOT%"=="%LINK%" (
  echo [0/3] Building from: %ROOT%
  echo.
  echo ERROR: Windows path too long for Gradle/CMake without short junction.
  echo.
  echo Run ONCE as Administrator:
  echo   mklink /J C:\nc "%ROOT%"
  echo.
  echo Then run this script again. It will build from C:\nc automatically.
  echo Alternative: enable LongPathsEnabled in Windows ^(requires reboot^).
  exit /b 1
) else (
  echo [0/3] Building from: %BUILD_ROOT% ^(short path for CMake^)
)

cd /d "%BUILD_ROOT%"
echo.

where java >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\Android\Android Studio\jbr" (
    set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
  ) else if exist "C:\Program Files\Microsoft\jdk-17" (
    set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17"
  ) else (
    for /d %%D in ("C:\Program Files\Eclipse Adoptium\jdk-17*") do (
      if not defined JAVA_HOME set "JAVA_HOME=%%~fD"
    )
  )
  if defined JAVA_HOME set "PATH=!JAVA_HOME!\bin;!PATH!"
)
where java >nul 2>nul
if errorlevel 1 (
  echo ERROR: JDK 17 not found.
  exit /b 1
)

set "CI=1"
set "NODE_ENV=production"

echo [1/3] Cleaning Gradle / CMake cache...
if exist android\gradlew.bat (
  pushd android
  call gradlew.bat --stop 2>nul
  popd
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%BUILD_ROOT%\scripts\stop-gradle-daemons.ps1"
timeout /t 2 /nobreak >nul
if exist android\app\.cxx rd /s /q android\app\.cxx 2>nul
if exist android\app\build rd /s /q android\app\build 2>nul
if exist android\build rd /s /q android\build 2>nul

echo [2/3] expo prebuild...
call npx expo prebuild --platform android
if errorlevel 1 (
  echo ERROR: expo prebuild failed.
  exit /b 1
)

set "ANDROID_SDK_ROOT="
if defined ANDROID_HOME if exist "%ANDROID_HOME%" set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
if not defined ANDROID_SDK_ROOT if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk"
if not defined ANDROID_SDK_ROOT (
  echo ERROR: Android SDK not found.
  exit /b 1
)
set "ANDROID_HOME=%ANDROID_SDK_ROOT%"
echo sdk.dir=%ANDROID_SDK_ROOT:\=\\%>android\local.properties

echo [3/3] Gradle assembleRelease...
cd android
call gradlew.bat assembleRelease
set "GRADLE_ERR=!errorlevel!"
cd ..

if !GRADLE_ERR! neq 0 (
  echo.
  echo ERROR: Gradle failed.
  echo.
  echo Fix for "260 characters" on Windows:
  echo   1. Admin CMD: mklink /J C:\nc "%ROOT%"
  echo      Then run this script again.
  echo   2. Admin PowerShell + reboot:
  echo      New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
  exit /b 1
)

echo.
echo SUCCESS!
echo APK: %BUILD_ROOT%\android\app\build\outputs\apk\release\app-release.apk
echo Install: adb install -r android\app\build\outputs\apk\release\app-release.apk

endlocal
