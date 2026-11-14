param(
    [int]$Port = 8082,
    [string]$Data = "data"
)

# Compile src/story/*.java and start the story's Java web server (JDK 17+), on Windows.
#   .\run-story.ps1                  -> http://localhost:8082
#   .\run-story.ps1 -Port 9000       -> http://localhost:9000
#   .\run-story.ps1 -Data some\dir   -> read the data branch's JSON from another folder

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

if (-not ((Get-Command javac -ErrorAction SilentlyContinue) -and (Get-Command java -ErrorAction SilentlyContinue))) {
    throw "JDK (javac/java) was not found in PATH."
}
$out = Join-Path ([System.IO.Path]::GetTempPath()) "payload-pets-story-build"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$javaFiles = Get-ChildItem -Path "src\story" -Filter "*.java" | Select-Object -ExpandProperty FullName
& javac -d $out $javaFiles
& java -cp $out story.StoryServer $Port --data $Data
