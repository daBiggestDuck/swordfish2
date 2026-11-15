param(
    [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

$javac = Get-Command javac -ErrorAction SilentlyContinue
$java = Get-Command java -ErrorAction SilentlyContinue

if ($javac -and $java) {
    New-Item -ItemType Directory -Force -Path "out" | Out-Null
    $javaFiles = Get-ChildItem -Path "src\map" -Filter "*.java" | Select-Object -ExpandProperty FullName
    & javac -d out $javaFiles
    & java -cp out map.MapServer $Port
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
    & node tools\serve_map.mjs $Port
} else {
    throw "Neither JDK (javac/java) nor Node.js was found in PATH."
}
