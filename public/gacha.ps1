$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$exe = Join-Path (Get-Location).Path 'gacha.exe'

try {
    Invoke-WebRequest 'https://github.com/AutumnVN/ssgacha/releases/download/release/gacha.exe' -OutFile $exe
    & $exe
}
catch {
    Write-Host $_
}
