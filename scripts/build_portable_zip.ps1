param(
    [switch]$IncludeEngine
)

if ($IncludeEngine) {
    throw "-IncludeEngine is permanently disabled. Fairy-Stockfish is GPL-3.0; bundling the binary into a distributable ZIP is a conveyance that triggers corresponding-source obligations. The engine is server-side only. See R38(b)."
}

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Stage = Join-Path $Root "reports\thejimmyapp-portable"
$Zip = Join-Path $Root "reports\thejimmyapp-portable.zip"

if (Test-Path -LiteralPath $Stage) {
    Remove-Item -LiteralPath $Stage -Recurse -Force
}
if (Test-Path -LiteralPath $Zip) {
    Remove-Item -LiteralPath $Zip -Force
}

New-Item -ItemType Directory -Path $Stage | Out-Null

$Files = @(
    "app.py",
    "how to start.txt",
    "requirements.txt",
    "README.md",
    "PORTABLE_APP.md",
    "start_thejimmyapp.bat"
)

foreach ($File in $Files) {
    Copy-Item -LiteralPath (Join-Path $Root $File) -Destination $Stage -Force
}

$Dirs = @(
    ".streamlit",
    "thejimmyapp"
)

foreach ($Dir in $Dirs) {
    Copy-Item -LiteralPath (Join-Path $Root $Dir) -Destination (Join-Path $Stage $Dir) -Recurse -Force
}

Get-ChildItem -LiteralPath $Stage -Directory -Filter "__pycache__" -Recurse |
    Remove-Item -Recurse -Force
Get-ChildItem -LiteralPath $Stage -File -Filter "*.pyc" -Recurse |
    Remove-Item -Force

foreach ($Dir in @("data", "engines", "logs", "reports", "secrets")) {
    New-Item -ItemType Directory -Path (Join-Path $Stage $Dir) | Out-Null
}

$DocsDir = Join-Path $Stage "docs"
New-Item -ItemType Directory -Path $DocsDir | Out-Null
$Docs = @(
    "reports\INSTALLATION_AND_ENRICHMENT_GUIDE.md",
    "reports\The_Jimmy_App_Improvement_Guide.md",
    "reports\The_Jimmy_App_What_This_App_Can_Do.pdf",
    "reports\The_Jimmy_App_Installation_and_Enrichment_Guide.pdf"
)
foreach ($Doc in $Docs) {
    $Source = Join-Path $Root $Doc
    if (Test-Path -LiteralPath $Source) {
        Copy-Item -LiteralPath $Source -Destination $DocsDir -Force
    }
}

New-Item -ItemType File -Path (Join-Path $Stage "data\.gitkeep") -Force | Out-Null
New-Item -ItemType File -Path (Join-Path $Stage "engines\.gitkeep") -Force | Out-Null
New-Item -ItemType File -Path (Join-Path $Stage "logs\.gitkeep") -Force | Out-Null
New-Item -ItemType File -Path (Join-Path $Stage "reports\.gitkeep") -Force | Out-Null
New-Item -ItemType File -Path (Join-Path $Stage "secrets\.gitkeep") -Force | Out-Null

Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $Zip -Force

Write-Output "Created: $Zip"
Write-Output "Secrets, local database, logs, videos, and .venv are not included."
Write-Output "Engine never included. Fairy-Stockfish is server-side only (GPL-3.0)."
