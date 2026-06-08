# Rebuilds the distributable bundles in dist/:
#   - StudyQuiz.mcaddon          (the two packs only, for one-click import)
#   - StudyQuiz-Full-Project.zip (everything except secrets/.git/dist)
# Uses forward-slash entry names so Minecraft/Bedrock accepts the archive.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$dist = Join-Path $root 'dist'
if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }

function New-Zip {
    param(
        [string]$ZipPath,
        [string[]]$IncludeRoots,   # top-level folders/files to include
        [string]$ExcludeRegex      # relative paths (forward slash) to skip
    )
    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
    $zip = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($inc in $IncludeRoots) {
            $full = Join-Path $root $inc
            if (-not (Test-Path $full)) { continue }
            Get-ChildItem -Path $full -Recurse -File -Force | ForEach-Object {
                $rel = $_.FullName.Substring($root.Length + 1).Replace('\','/')
                if ($ExcludeRegex -and ($rel -match $ExcludeRegex)) { return }
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
New-Zip -ZipPath (Join-Path $dist 'StudyQuiz-Full-Project.zip') `
        -IncludeRoots @('study_quiz_bp','study_quiz_rp','proxy','tools','install-bds.bat','README.md','USER_GUIDE.md','LICENSE') `
        -ExcludeRegex '(^|/)\.git/|(^|/)dist/|key\.txt$|key\.txt\.txt$'

Write-Host "Done." -ForegroundColor Cyan
