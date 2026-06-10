# Rebuilds the distributable bundles in dist/:
#   - StudyQuiz.mcaddon          (the two packs only, for one-click import)
#   - StudyQuiz-Full-Project.zip (everything except secrets/.git/dist)
# Uses forward-slash entry names so Minecraft/Bedrock accepts the archive.
#
# SECRET GUARD: dist/StudyQuiz.mcaddon is committed to git and BUNDLES
# userConfig.js. If you've pointed the game at your own cloud backend (real
# token / non-localhost endpoint), building would bake that secret into a
# public artifact. The guard below aborts in that case. Pass -AllowSecrets to
# build a PRIVATE bundle anyway (do NOT commit it).

param(
    [switch]$AllowSecrets
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$dist = Join-Path $root 'dist'
if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }

function Assert-PlaceholderConfig {
    # Reads study_quiz_bp/scripts/userConfig.js and refuses to build a
    # committable bundle when it carries a real secret instead of placeholders.
    $cfgPath = Join-Path $root 'study_quiz_bp/scripts/userConfig.js'
    if (-not (Test-Path $cfgPath)) { return }
    $cfg = Get-Content $cfgPath -Raw

    $val = {
        param($name)
        $m = [regex]::Match($cfg, ('(?m)^\s*export\s+const\s+{0}\s*=\s*"([^"]*)"' -f $name))
        if ($m.Success) { return $m.Groups[1].Value } else { return $null }
    }

    $problems = @()
    $apiKey   = & $val 'USER_API_KEY'
    $cloud    = & $val 'USER_CLOUD_API_BASE'
    $endpoint = & $val 'USER_API_ENDPOINT'

    if ($null -ne $apiKey -and $apiKey -ne 'local-proxy' -and $apiKey -ne '') {
        $problems += "USER_API_KEY is set to a real token (must be 'local-proxy' for a committed build)."
    }
    if ($null -ne $cloud -and $cloud -ne '') {
        $problems += "USER_CLOUD_API_BASE points at a live backend ('$cloud')."
    }
    if ($null -ne $endpoint -and $endpoint -notmatch '127\.0\.0\.1|localhost') {
        $problems += "USER_API_ENDPOINT is not localhost ('$endpoint')."
    }

    if ($problems.Count -gt 0) {
        Write-Host "SECRET GUARD: refusing to build a committable bundle." -ForegroundColor Red
        $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        Write-Host "Reset userConfig.js to placeholders before building/committing," -ForegroundColor Yellow
        Write-Host "or run:  tools\build-dist.ps1 -AllowSecrets   (PRIVATE bundle - do NOT commit it)." -ForegroundColor Yellow
        throw "userConfig.js contains non-placeholder values."
    }
}

if (-not $AllowSecrets) {
    Assert-PlaceholderConfig
}
else {
    Write-Host "WARNING: -AllowSecrets set. Building with whatever is in userConfig.js. Do NOT commit dist/." -ForegroundColor Yellow
}

function New-Zip {
    param(
        [string]$ZipPath,
        [string[]]$IncludeRoots,   # top-level folders/files to include
        [string]$ExcludeRegex      # relative paths (forward slash) to skip
    )
    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
    $zip = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Create)
    # Track entry names we've already added so a file reachable from more than one
    # include root (or re-enumerated) is written exactly once.
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    try {
        foreach ($inc in $IncludeRoots) {
            $full = Join-Path $root $inc
            if (-not (Test-Path $full)) { continue }
            Get-ChildItem -Path $full -Recurse -File -Force | ForEach-Object {
                $rel = $_.FullName.Substring($root.Length + 1).Replace('\','/')
                if ($ExcludeRegex -and ($rel -match $ExcludeRegex)) { return }
                if (-not $seen.Add($rel)) { return }
                [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel)
            }
        }
    } finally {
        $zip.Dispose()
    }
    Write-Host "Built $ZipPath" -ForegroundColor Green
}

# 1) The add-on: just the two packs.
New-Zip -ZipPath (Join-Path $dist 'StudyQuiz.mcaddon') `
        -IncludeRoots @('study_quiz_bp','study_quiz_rp') `
        -ExcludeRegex 'examples/'

# 2) Full project: everything a person needs, minus secrets/.git/dist.
#    Includes the optional cloud/ backend but never its Terraform state or
#    secrets (terraform.tfvars, *.tfstate, .terraform/, build zips).
New-Zip -ZipPath (Join-Path $dist 'StudyQuiz-Full-Project.zip') `
        -IncludeRoots @('study_quiz_bp','study_quiz_rp','proxy','cloud','tools','install-bds.bat','README.md','USER_GUIDE.md','LICENSE') `
        -ExcludeRegex '(^|/)\.git/|(^|/)dist/|key\.txt$|key\.txt\.txt$|(^|/)\.terraform/|(^|/)\.build/|\.tfstate(\.[0-9]+)?$|\.tfstate\.backup$|(^|/)terraform\.tfvars$|\.auto\.tfvars$'

Write-Host "Done." -ForegroundColor Cyan
