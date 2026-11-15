param(
    [switch]$OfflineValidate,
    [string]$StartTime = "2026-11-10",
    [string]$StopTime = "2026-12-09 12:00",
    [string]$StepSize = "4 h"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$mapsDir = Join-Path $repoRoot "data\maps"
$rawDir = Join-Path $mapsDir "raw"

New-Item -ItemType Directory -Force -Path $mapsDir | Out-Null
New-Item -ItemType Directory -Force -Path $rawDir | Out-Null

$requiredFiles = @(
    (Join-Path $mapsDir "NOTICE.md"),
    (Join-Path $mapsDir "lunar_map_data.json"),
    (Join-Path $rawDir "quickmap_lroc_stack3314.json"),
    (Join-Path $rawDir "trek_clps_sites.json"),
    (Join-Path $rawDir "trek_south_pole_psr.json"),
    (Join-Path $rawDir "trek_lola_terrain_profiles.json"),
    (Join-Path $rawDir "horizons_lunar_ephemeris.json")
)

if ($OfflineValidate) {
    Write-Host "Validating local NASA lunar map datasets under $mapsDir ..."
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path $file)) {
            throw "Missing required map dataset: $file"
        }
        $item = Get-Item $file
        if ($item.Length -le 0) {
            throw "Empty map dataset file: $file"
        }
        if ($file.EndsWith(".json")) {
            $null = Get-Content -Raw -Path $file | ConvertFrom-Json
        }
        Write-Host "  [OK] $($item.Name) ($($item.Length) bytes)"
    }
    Write-Host "Offline map dataset validation succeeded."
    exit 0
}

Write-Host "Fetching live NASA lunar datasets (anonymous access) into $rawDir ..."

# 1. NASA Moon Trek - CLPS Landing Sites (EPSG:104903 FeatureSet JSON)
$trekSitesUrl = "https://trek.nasa.gov/moon/trekarcgis3/rest/services/CLPS_sites/MapServer/0/query?where=1%3D1&outFields=*&f=json"
Write-Host "Fetching Moon Trek CLPS sites: $trekSitesUrl"
Invoke-WebRequest -Uri $trekSitesUrl -OutFile (Join-Path $rawDir "trek_clps_sites.json") -UseBasicParsing

# 2. NASA Moon Trek - South Pole Permanently Shadowed Regions (PSR_SP FeatureSet JSON)
$trekPsrUrl = "https://trek.nasa.gov/moon/trekarcgis/rest/services/PSR_SP/MapServer/0/query?where=1%3D1&outFields=*&f=json"
Write-Host "Fetching Moon Trek South Pole PSR polygons: $trekPsrUrl"
Invoke-WebRequest -Uri $trekPsrUrl -OutFile (Join-Path $rawDir "trek_south_pole_psr.json") -UseBasicParsing

# 3. NASA/JPL Horizons API - Target 301 (Moon), Observer 500@399 (Earth), Quantities 14,15
$encodedStart = [System.Uri]::EscapeDataString("'$StartTime'")
$encodedStop = [System.Uri]::EscapeDataString("'$StopTime'")
$encodedStep = [System.Uri]::EscapeDataString("'$StepSize'")
$horizonsUrl = "https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='301'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&CENTER='500@399'&START_TIME=$encodedStart&STOP_TIME=$encodedStop&STEP_SIZE=$encodedStep&QUANTITIES='14,15'&CSV_FORMAT='YES'"
Write-Host "Fetching JPL Horizons ephemeris: $horizonsUrl"
Invoke-WebRequest -Uri $horizonsUrl -OutFile (Join-Path $rawDir "horizons_lunar_ephemeris.json") -UseBasicParsing

# 4. LROC QuickMap stack 3314 HTML snapshot (metadata reference; JSON config already stored)
$quickMapUrl = "https://quickmap.lroc.im-ldi.com/?prjExtent=-2456929.2929293%2C-1737400%2C2456929.2929293%2C1737400&earthShadowEnabled=true&proj=10&stack=3314&defs=N4IgzGCMAsIFygPYAcCGBjAlgFwJ70gF9Cg"
Write-Host "Fetching LROC QuickMap state snapshot: $quickMapUrl"
Invoke-WebRequest -Uri $quickMapUrl -OutFile (Join-Path $rawDir "quickmap_lroc_snapshot.html") -UseBasicParsing

Write-Host "Done. Raw NASA map responses stored in $rawDir; backend adapts new records automatically."

