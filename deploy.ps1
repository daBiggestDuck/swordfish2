# Start the Payload Pets deployer on Windows: a local dashboard of every branch on GitHub.
# Needs only a JDK (Java 17+) and git.   .\deploy.ps1   ->  http://localhost:8000
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$out = Join-Path $env:TEMP "payload-pets-deployer-build"
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Path $out | Out-Null
javac -d $out (Get-ChildItem deployer/src/deployer/*.java | ForEach-Object { $_.FullName })
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Copy-Item -Recurse deployer/web (Join-Path $out "web")
java -cp $out deployer.Deployer @args
