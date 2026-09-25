$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = [string]$manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$') {
    throw 'package.json must contain a valid version for the package filename.'
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist/index.html'))) {
    throw 'Build the app first with npm run build.'
}

# An explicit list keeps dependencies, personal files, PDFs, and old builds out.
$include = @(
    'src', 'desktop', 'public', 'dist', 'scripts', 'tests', 'docs',
    'package.json', 'package-lock.json', 'index.html', 'vite.config.js',
    'electron-builder.json', 'playwright.config.js', 'playwright.desktop.config.js',
    'README.md', 'GUIDE.md', 'LICENSE', '.gitignore', 'svglol.svg',
    'install-dependencies.bat', 'start-app.bat', 'package-dev.bat'
)
$files = foreach ($item in $include) {
    $source = Get-Item -LiteralPath (Join-Path $projectRoot $item)
    if ($source.PSIsContainer) {
        Get-ChildItem -LiteralPath $source.FullName -Recurse -File
    } else {
        $source
    }
}
$files = $files | Where-Object {
    $_.Extension -ne '.pdf' -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)
} | Sort-Object FullName

$packageName = "PDFthing-$version-dev"
$outputDirectory = Join-Path $projectRoot 'release'
[IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
$outputPath = Join-Path $outputDirectory "$packageName.zip"
$stream = [IO.File]::Open($outputPath, [IO.FileMode]::Create, [IO.FileAccess]::Write)
try {
    $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in $files) {
            $relativePath = $file.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive, $file.FullName, "$packageName/$relativePath", [IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    } finally {
        $archive.Dispose()
    }
} finally {
    $stream.Dispose()
}

$size = [math]::Round((Get-Item -LiteralPath $outputPath).Length / 1MB, 2)
Write-Host "Created $outputPath ($size MiB)"
Write-Host 'Share this ZIP. Extract it, run install-dependencies.bat once, then start-app.bat.'
