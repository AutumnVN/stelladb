$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Step { param($Text) Write-Host ''; Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Ok   { param($Text) Write-Host "    $Text" -ForegroundColor Green }
function Write-Note { param($Text) Write-Host "    $Text" -ForegroundColor DarkGray }
function Write-Warn { param($Text) Write-Host "    $Text" -ForegroundColor Yellow }

$MoggerBat = @'
@echo off

if /i "%~1"=="wait" goto waitmode
if /i "%~1"=="run" goto main

>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo Requesting administrative privileges...
    goto UACPrompt
) else ( goto gotAdmin )
:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    exit /B
:gotAdmin
    if exist "%temp%\getadmin.vbs" ( del "%temp%\getadmin.vbs" )

if defined WT_SESSION goto main
start "" wt -w 0 new-tab --title "ps mogger" cmd /c "%~s0" run
exit /b

:main
set "LL=%USERPROFILE%\AppData\LocalLow\__COMPANY__"
set "GAME=%LL%\__PROFILE__"
set "BASE=%LOCALAPPDATA%\stellasora-login"
set "LIVE=%BASE%\live"
set "PS=%BASE%\ps"
set "PREFS=HKCU\Software\__COMPANY__\__PROFILE__"

if not exist "%BASE%" mkdir "%BASE%"
if not exist "%LIVE%" (
    if not exist "%GAME%" (
        mkdir "%LIVE%"
    ) else (
        move "%GAME%" "%LIVE%"
        if errorlevel 1 (
            echo Close StellaSora first, then run this again.
            pause
            exit /b 1
        )
    )
)
if not exist "%PS%" mkdir "%PS%"

reg export "%PREFS%" "%LIVE%\prefs.reg" /y >nul
if exist "%PS%\prefs.reg" (
    reg delete "%PREFS%" /f >nul 2>&1
    reg import "%PS%\prefs.reg" >nul 2>&1
)

if exist "%GAME%" rmdir "%GAME%"
mklink /J "%GAME%" "%PS%"
if errorlevel 1 (
    echo Could not switch the game data folder to ps.
    pause
    exit /b 1
)

wt new-tab --title "mitmproxy" -d "__NEBULA__\mitmproxy" cmd /k mitmproxy -k -m wireguard --set stream_large_bodies=3m --set block_global=false --mode local:StellaSora.exe -s proxy.py ; new-tab --title "Injector" -d "__DL__" cmd /k stellaDllInjector.exe stellaCombatLogger.dll ; new-tab --title "Log Viewer" -d "__DL__" cmd /k log_viewer.exe ; new-tab --title "Nebula" -d "__NEBULA__" cmd /k call "Start Server.bat"

timeout /t 8 /nobreak >nul
start /d "__GAME__" "" "StellaSora.exe"

set "VBS=%TEMP%\pswait.vbs"
> "%VBS%" echo Set sh = CreateObject("WScript.Shell")
>> "%VBS%" echo sh.Run """%~f0"" wait", 0, False
wscript //nologo "%VBS%"
exit /b 0

:waitmode
set "LL=%USERPROFILE%\AppData\LocalLow\__COMPANY__"
set "GAME=%LL%\__PROFILE__"
set "BASE=%LOCALAPPDATA%\stellasora-login"
set "LIVE=%BASE%\live"
set "PS=%BASE%\ps"
set "PREFS=HKCU\Software\__COMPANY__\__PROFILE__"

set /a tries=0
:waitlaunch
timeout /t 2 /nobreak >nul
tasklist /fi "imagename eq StellaSora.exe" 2>nul | find /i "StellaSora.exe" >nul
if not errorlevel 1 goto waitclose
set /a tries+=1
if %tries% lss 150 goto waitlaunch
goto switchback

:waitclose
timeout /t 5 /nobreak >nul
tasklist /fi "imagename eq StellaSora.exe" 2>nul | find /i "StellaSora.exe" >nul
if not errorlevel 1 goto waitclose
powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter \"Name='java.exe'\" | Where-Object { $_.CommandLine -like '*Nebula.jar*' }) { exit 0 } else { exit 1 }"
if not errorlevel 1 goto waitclose

timeout /t 2 /nobreak >nul

:switchback
set "MSG=Live login restored."
reg export "%PREFS%" "%PS%\prefs.reg" /y >nul
if not exist "%LIVE%\prefs.reg" set "MSG=No saved live prefs, only the folder was switched back."
if exist "%LIVE%\prefs.reg" (
    reg delete "%PREFS%" /f >nul 2>&1
    reg import "%LIVE%\prefs.reg" >nul 2>&1
    if errorlevel 1 set "MSG=Live login restore failed."
)
if exist "%GAME%" rmdir "%GAME%"
mklink /J "%GAME%" "%LIVE%"
if errorlevel 1 set "MSG=Could not switch the game folder back to live."
wt -w 0 new-tab --title "ps mogger" cmd /c "echo %MSG%& timeout /t 1 /nobreak>nul"
exit /b 0
'@

$ResourcesBat = @'
@echo off

cd /d "__SSDATA__"
git fetch origin
if errorlevel 1 (
    echo git fetch failed
    exit /b 1
)
git reset --hard origin/main
if errorlevel 1 (
    echo git reset failed
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -Recurse -Force '__SSDATA__\EN\bin','__SSDATA__\EN\language'; Copy-Item -Recurse -Force '__NEBULA__\resources\bin','__NEBULA__\resources\language' '__SSDATA__\EN\'"
if errorlevel 1 (
    echo copy failed
    exit /b 1
)

echo resources updated
'@

$RebuildBat = @'
@echo off

cd /d "__NEBULA__"
git pull --rebase
if errorlevel 1 (
    echo git pull failed
    exit /b 1
)

call gradlew.bat build
if errorlevel 1 (
    echo build failed
    exit /b 1
)

echo build done
'@

function Get-JavaMajor {
    $cmd = Get-Command java -ErrorAction SilentlyContinue
    if (-not $cmd) { return 0 }
    $old = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $text = (& $cmd.Source -version 2>&1 | Out-String)
    } finally {
        $ErrorActionPreference = $old
    }
    $m = [regex]::Match($text, 'version "(\d+)(?:\.(\d+))?')
    if (-not $m.Success) { return 0 }
    if ($m.Groups[1].Value -eq '1') { return [int]$m.Groups[2].Value }
    return [int]$m.Groups[1].Value
}

function Get-GameProfile {
    param([string]$GameDir)
    $info = Join-Path $GameDir 'StellaSora_Data\app.info'
    if (-not (Test-Path $info)) { throw "missing $info - is this the Stella Sora install folder?" }
    $lines = [IO.File]::ReadAllLines($info)
    $company = $lines[0].Trim()
    $product = $lines[1].Trim()
    if (-not $company -or -not $product) { throw "could not read company and product from $info" }
    [pscustomobject]@{ Company = $company; Product = $product }
}

function Test-Appx {
    param([string]$Name)
    $command = 'if (Get-AppxPackage -Name ''' + $Name + ''' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }'
    & powershell -NoProfile -ExecutionPolicy Bypass -Command $command | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Add-Appx {
    param([string]$Path)
    $command = 'try { Add-AppxPackage -Path ''' + $Path + ''' -ErrorAction Stop; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }'
    & powershell -NoProfile -ExecutionPolicy Bypass -Command $command
    if ($LASTEXITCODE -ne 0) { throw "could not install $(Split-Path $Path -Leaf)" }
}

function Install-Winget {
    Write-Note 'installing winget (App Installer)'
    $temp = Join-Path $env:TEMP 'ps-setup-winget'
    New-Item -ItemType Directory $temp -Force | Out-Null

    if (-not (Test-Appx 'Microsoft.VCLibs.140.00.UWPDesktop')) {
        $file = Join-Path $temp 'Microsoft.VCLibs.x64.14.00.Desktop.appx'
        Invoke-WebRequest 'https://aka.ms/Microsoft.VCLibs.x64.14.00.Desktop.appx' -OutFile $file -UseBasicParsing
        Add-Appx $file
        Write-Ok 'Microsoft.VCLibs.140.00.UWPDesktop'
    }

    if (-not (Test-Appx 'Microsoft.UI.Xaml.2.8')) {
        $file = Join-Path $temp 'Microsoft.UI.Xaml.2.8.x64.appx'
        Invoke-WebRequest 'https://github.com/microsoft/microsoft-ui-xaml/releases/download/v2.8.6/Microsoft.UI.Xaml.2.8.x64.appx' -OutFile $file -UseBasicParsing
        Add-Appx $file
        Write-Ok 'Microsoft.UI.Xaml.2.8'
    }

    if (-not (Test-Appx 'Microsoft.DesktopAppInstaller')) {
        $file = Join-Path $temp 'Microsoft.DesktopAppInstaller.msixbundle'
        Invoke-WebRequest 'https://aka.ms/getwinget' -OutFile $file -UseBasicParsing
        Add-Appx $file
        Write-Ok 'Microsoft.DesktopAppInstaller'
    } else {
        Write-Note 'App Installer is already installed'
    }

    Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue

    for ($i = 0; $i -lt 5 -and -not (Get-Command winget -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Seconds 1 }
}

function Get-MissingPrereqs {
    $missing = New-Object System.Collections.Generic.List[string]
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { $missing.Add('winget') }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { $missing.Add('git') }
    if ((Get-JavaMajor) -lt 21) { $missing.Add('java') }
    if (-not (Get-Command mitmproxy -ErrorAction SilentlyContinue)) { $missing.Add('mitmproxy') }
    if (-not (Get-Command wt -ErrorAction SilentlyContinue)) { $missing.Add('wt') }
    ,$missing
}

function Install-Prereq {
    param([string]$Name)
    $ids = @{ git = 'Git.Git'; java = 'Microsoft.OpenJDK.21'; mitmproxy = 'mitmproxy.mitmproxy'; wt = 'Microsoft.WindowsTerminal' }
    Write-Host "    winget install $($ids[$Name])"
    & winget install --id $ids[$Name] -e --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity
    $code = $LASTEXITCODE
    if ($code -eq -1978335189) {
        Write-Note "$($ids[$Name]) is already installed"
    } elseif ($code -ne 0) {
        throw "winget install $($ids[$Name]) failed with exit code $code"
    }
}

function Install-MitmCert {
    $confdir = Join-Path $env:USERPROFILE '.mitmproxy'
    $cer = Join-Path $confdir 'mitmproxy-ca-cert.cer'
    $cert = $null

    if (Test-Path $cer) {
        $cert = New-Object Security.Cryptography.X509Certificates.X509Certificate2 $cer
    } else {
        Write-Note 'generating certificate'
        $proc = Start-Process mitmdump -ArgumentList '--set', "confdir=$confdir", '--listen-port', '0', '-q' -PassThru -WindowStyle Hidden
        try {
            for ($i = 0; $i -lt 20 -and -not $cert; $i++) {
                Start-Sleep -Milliseconds 500
                if (Test-Path $cer) {
                    try { $cert = New-Object Security.Cryptography.X509Certificates.X509Certificate2 $cer } catch { }
                }
            }
        } finally {
            if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
        }
        if (-not $cert) { throw "mitmproxy did not create a usable certificate at $cer" }
    }

    if (Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }) {
        Write-Note 'already trusted for this user'
        return
    }

    & certutil -addstore -user Root $cer | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "certutil could not trust $cer" }
    Write-Ok 'trusted for this user'
}

function Set-BatFile {
    param([string]$Path, [string]$Content, [hashtable]$Map)
    foreach ($key in $Map.Keys) { $Content = $Content.Replace($key, $Map[$key]) }
    $Content = ($Content -replace "`r`n", "`n") -replace "`n", "`r`n"
    if (Test-Path $Path) {
        $old = [IO.File]::ReadAllText($Path)
        if ($old -eq $Content) {
            Write-Note "$(Split-Path $Path -Leaf) already up to date"
            return
        }
        Copy-Item $Path "$Path.bak" -Force
        Write-Note "backed up old $(Split-Path $Path -Leaf) to .bak"
    }
    [IO.File]::WriteAllText($Path, $Content, [Text.Encoding]::ASCII)
    Write-Ok "$Path"
}

function Invoke-PsSetup {
    $Downloads = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path
    $Desktop = [Environment]::GetFolderPath('Desktop')
    $Nebula = Join-Path $Downloads 'Nebula'
    $SsData = Join-Path $Downloads 'ss-data'
    $Resources = Join-Path $Nebula 'resources'

    Write-Host 'Stella Sora private server setup' -ForegroundColor White
    Write-Note "downloads: $Downloads"
    Write-Note "desktop:   $Desktop"

    $GameDir = 'C:\YostarGames\StellaSora_EN'
    if (-not (Test-Path (Join-Path $GameDir 'StellaSora.exe'))) {
        $answer = (Read-Host 'StellaSora install folder (the one containing StellaSora.exe)').Trim().Trim('"')
        if ($answer) { $GameDir = $answer }
    }
    if (-not (Test-Path (Join-Path $GameDir 'StellaSora.exe'))) {
        throw "StellaSora.exe not found in '$GameDir'"
    }
    $Profile = Get-GameProfile $GameDir
    Write-Note "game data: $($Profile.Product)"

    Write-Step 'Checking prerequisites'
    $missing = Get-MissingPrereqs
    if ($missing.Count -gt 0) {
        foreach ($name in $missing) { Write-Warn "missing: $name" }
        $answer = Read-Host 'Install the missing prerequisites automatically now? [y/N]'
        if ($answer -match '^(y|yes)$') {
            if ($missing -contains 'winget') { Install-Winget }
            foreach ($name in $missing) { if ($name -ne 'winget') { Install-Prereq $name } }
            $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
            $missing = Get-MissingPrereqs
        }
        if ($missing -contains 'winget') {
            Write-Warn 'if App Installer is already installed, enable its app execution alias in Settings > Apps > Advanced app settings > App execution aliases'
        }
        if ($missing -contains 'wt') {
            Write-Warn 'if Windows Terminal is already installed, enable its app execution alias in Settings > Apps > Advanced app settings > App execution aliases'
        }
        if ($missing.Count -gt 0) {
            throw "still missing: $($missing -join ', ') - install them, open a new terminal and run this again"
        }
    }
    Write-Ok "winget $(& winget --version)"
    Write-Ok "git $((& git --version).Split(' ')[2])"
    Write-Ok "java $(Get-JavaMajor)"
    Write-Ok 'mitmproxy'
    Write-Ok 'wt (windows terminal)'
    $port80 = @(Get-NetTCPConnection -LocalPort 80 -State Listen -ErrorAction SilentlyContinue)
    if ($port80.Count -gt 0) {
        $owners = $port80 | ForEach-Object { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName } | Sort-Object -Unique
        Write-Warn "port 80 is in use by $($owners -join ', ') - Nebula binds port 80, stop it before starting the server"
    } else {
        Write-Ok 'port 80 free'
    }

    Write-Step 'mitmproxy certificate'
    Install-MitmCert

    Write-Step 'Nebula'
    if (Test-Path (Join-Path $Nebula '.git')) {
        Write-Note 'pulling'
        & git -C $Nebula pull --rebase
        if ($LASTEXITCODE -ne 0) { throw "git pull failed in $Nebula" }
    } else {
        Write-Note 'cloning'
        & git clone https://github.com/Melledy/Nebula $Nebula
        if ($LASTEXITCODE -ne 0) { throw "git clone failed for $Nebula" }
    }

    Write-Note 'building Nebula.jar'
    Push-Location $Nebula
    try {
        & .\gradlew.bat build
        $buildCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($buildCode -ne 0) { throw "gradlew build failed with exit code $buildCode" }
    $Jar = Join-Path $Nebula 'Nebula.jar'
    if (-not (Test-Path $Jar)) { throw "build finished but $Jar is missing" }
    Write-Ok "$Jar ($([math]::Round((Get-Item $Jar).Length / 1MB)) MB)"

    Write-Step 'ss-data'
    if (Test-Path (Join-Path $SsData '.git')) {
        Write-Note "$SsData already cloned"
    } else {
        & git clone https://github.com/AutumnVN/ss-data $SsData
        if ($LASTEXITCODE -ne 0) { throw "git clone failed for $SsData" }
        Write-Ok $SsData
    }

    Write-Step 'Nebula resources'
    if ((Test-Path (Join-Path $Resources 'bin')) -and (Test-Path (Join-Path $Resources 'language'))) {
        Write-Note 'resources\bin and resources\language already present'
    } else {
        New-Item -ItemType Directory $Resources -Force | Out-Null
        foreach ($part in 'bin', 'language') {
            $source = Join-Path $SsData "EN\$part"
            if (-not (Test-Path $source)) { throw "missing $source" }
            $target = Join-Path $Resources $part
            if (Test-Path $target) { Remove-Item -Recurse -Force $target }
            Copy-Item -Recurse -Force $source $Resources
            Write-Ok "$target"
        }
    }

    Write-Step 'Nebula intro skip'
    $ConfigFile = Join-Path $Nebula 'data\config.json'
    New-Item -ItemType Directory (Split-Path $ConfigFile) -Force | Out-Null
    if (Test-Path $ConfigFile) {
        $config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
        if (-not $config.PSObject.Properties['serverOptions']) {
            $config | Add-Member -NotePropertyName serverOptions -NotePropertyValue ([pscustomobject]@{})
        }
        $config.serverOptions | Add-Member -NotePropertyName skipIntro -NotePropertyValue $true -Force
        $configText = $config | ConvertTo-Json -Depth 20
    } else {
        $configText = "{`n  `"serverOptions`": {`n    `"skipIntro`": true`n  }`n}"
    }
    [IO.File]::WriteAllText($ConfigFile, $configText, (New-Object Text.UTF8Encoding($false)))
    Write-Ok 'serverOptions.skipIntro = true'

    Write-Step 'Combat logger, injector, log viewer'
    $tools = @(
        @{ Name = 'stellaCombatLogger.dll'; Url = 'https://github.com/MorphTheMoth/Stella-Sora-Combat-Logger/releases/latest/download/stellaCombatLogger.dll' },
        @{ Name = 'log_viewer.exe'; Url = 'https://github.com/MorphTheMoth/Stella-Sora-Combat-Logger/releases/latest/download/log_viewer.exe' },
        @{ Name = 'stellaDllInjector.exe'; Url = 'https://github.com/MorphTheMoth/StellaSora-Injector/releases/latest/download/stellaDllInjector.exe' }
    )
    foreach ($tool in $tools) {
        $destination = Join-Path $Downloads $tool.Name
        Invoke-WebRequest -Uri $tool.Url -OutFile $destination -UseBasicParsing
        Write-Ok "$destination ($([math]::Round((Get-Item $destination).Length / 1KB)) KB)"
    }

    Write-Step 'Desktop scripts'
    $map = @{
        '__DL__' = $Downloads
        '__NEBULA__' = $Nebula
        '__SSDATA__' = $SsData
        '__GAME__' = $GameDir
        '__COMPANY__' = $Profile.Company
        '__PROFILE__' = $Profile.Product
    }
    Set-BatFile -Path (Join-Path $Desktop 'ps mogger.bat') -Content $MoggerBat -Map $map
    Set-BatFile -Path (Join-Path $Desktop 'ps resources.bat') -Content $ResourcesBat -Map $map
    Set-BatFile -Path (Join-Path $Desktop 'ps rebuild.bat') -Content $RebuildBat -Map $map

    Write-Step 'Done'
    Write-Host ''
    Write-Host '  Three scripts are on your Desktop:' -ForegroundColor White
    Write-Host ''
    Write-Host '  ps mogger.bat' -ForegroundColor White
    Write-Note 'play on the private server. asks for admin once, opens mitmproxy / injector /'
    Write-Note 'log viewer / Nebula tabs, starts the game, and switches the game data + login'
    Write-Note 'back to live when the game and the server are both closed.'
    Write-Note 'first run moves your existing live data into stellasora-login\live automatically.'
    Write-Host ''
    Write-Host '  ps resources.bat' -ForegroundColor White
    Write-Note 'force-pulls ss-data (discards local changes), then replaces its EN\bin and'
    Write-Note 'EN\language with the ones in Nebula\resources.'
    Write-Note 'use it when the game updates new patch.'
    Write-Host ''
    Write-Host '  ps rebuild.bat' -ForegroundColor White
    Write-Note 'pulls the Nebula repo and rebuilds Nebula.jar in place.'
    Write-Note 'use it after Nebula gets new commits, then start the server again.'
    Write-Host ''
    Write-Note 'run this installer again any time to update Nebula, ss-data and the three scripts.'
    Write-Host ''
}

try {
    Invoke-PsSetup
} catch {
    Write-Host ''
    Write-Host "Setup failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Nothing was committed to the game login; fix the error and run the script again.' -ForegroundColor DarkGray
}
