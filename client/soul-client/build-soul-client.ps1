# Builds the Soul Client releases from the curated mod list.
#
#   * Soul-Client-<mc>.mrpack   -> import from the launcher (Library -> Import)
#   * client/version-<mc>/soul-client-<mc>.zip -> used by the in-app Soul Client card
#   * client/versions.json      -> the list the launcher reads
#
# Public mods come straight from Modrinth (the same public builds OneClient
# ships); the custom UI mods are bundled from client/soul-mods/.
#
# Build the custom mods once per Minecraft version (JDK 25 + Gradle 9):
#   $env:JAVA_HOME = '<jdk-25>'
#   foreach ($v in @('1.21.1','1.21.10','1.21.11','26.1.2')) {
#     gradle build -Pmcver=$v --project-dir client/soul-mods/soul-ui
#     gradle build -Pmcver=$v --project-dir client/soul-mods/soul-hud
#   }
# Each build writes client/soul-mods/<mod>/build/<mcver>/libs/<mod>-1.0.0-<mcver>.jar
# and this script bundles the matching pair into every version's pack.
#
# Run:  powershell -ExecutionPolicy Bypass -File client/soul-client/build-soul-client.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

# JSON must be written without a BOM: the launcher's serde parser rejects it.
function Write-JsonFile([string]$Path, $Value, [int]$Depth = 12) {
  $json = $Value | ConvertTo-Json -Depth $Depth
  [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding($false)))
}

$ClientDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Repo = Split-Path -Parent $ClientDir
$OneClientDir = Join-Path $Repo 'oneclient modpack'
$VersionDirsRoot = Join-Path $Repo 'version-'
$Tmp = Join-Path $env:TEMP ('soul-client-build-' + [guid]::NewGuid().ToString('N'))
$Now = Get-Date -Format 'yyyy-MM-dd'

# Curated 20: performance, visuals and quality-of-life, all public Modrinth mods.
$Mods = @(
  @{ slug = 'fabric-api';           id = 'P7dR8mSH'; title = 'Fabric API' },
  @{ slug = 'sodium';               id = 'AANobbMI'; title = 'Sodium' },
  @{ slug = 'lithium';              id = 'gvQqBUqZ'; title = 'Lithium' },
  @{ slug = 'ferrite-core';         id = 'uXXizFIs'; title = 'FerriteCore' },
  @{ slug = 'modernfix';            id = 'nmDcB62a'; title = 'ModernFix' },
  @{ slug = 'entityculling';        id = 'NNAgCjsB'; title = 'Entity Culling' },
  @{ slug = 'immediatelyfast';      id = '5ZwdcRci'; title = 'ImmediatelyFast' },
  @{ slug = 'badoptimizations';     id = 'g96Z4WVZ'; title = 'BadOptimizations' },
  @{ slug = 'dynamic-fps';          id = 'LQ3K71Q1'; title = 'Dynamic FPS' },
  @{ slug = 'iris';                 id = 'YL57xq9U'; title = 'Iris Shaders' },
  @{ slug = 'sodium-extra';         id = 'PtjYWJkn'; title = 'Sodium Extra' },
  @{ slug = 'modmenu';              id = 'mOgUt4GM'; title = 'Mod Menu' },
  @{ slug = 'cloth-config';         id = '9s6osm5g'; title = 'Cloth Config API' },
  @{ slug = 'yacl';                 id = '1eAoo2KR'; title = 'YetAnotherConfigLib (YACL)' },
  @{ slug = 'zoomify';              id = 'w7ThoJFB'; title = 'Zoomify (Zoom)' },
  @{ slug = 'lambdynamiclights';    id = 'yBW8D80W'; title = 'LambDynamicLights' },
  @{ slug = 'continuity';           id = '1IjD5062'; title = 'Continuity' },
  @{ slug = 'entity-model-features'; id = '4I1XuqiY'; title = 'Entity Model Features' },
  @{ slug = 'entitytexturefeatures'; id = 'BVzZfTc1'; title = 'Entity Texture Features' },
  @{ slug = 'modelfix';             id = 'QdG47OkI'; title = 'Model Gap Fix' }
)
$ModIds = @{}
foreach ($m in $Mods) { $ModIds[$m.id] = $m }

function Get-OneClientIndex([string]$mc) {
  $file = Get-ChildItem $OneClientDir -Filter "*$mc*.mrpack" | Select-Object -First 1
  if (-not $file) { throw "No OneClient modpack found for Minecraft $mc in $OneClientDir" }
  $stage = Join-Path $Tmp ('oc-' + ($mc -replace '[^\w]', '_'))
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  Copy-Item $file.FullName (Join-Path $stage 'pack.zip') -Force
  Expand-Archive (Join-Path $stage 'pack.zip') -DestinationPath $stage -Force
  return Get-Content -Raw (Join-Path $stage 'modrinth.index.json') | ConvertFrom-Json
}

function Get-SoulModJars([string]$mc) {
  $jars = @()
  foreach ($mod in @('soul-ui', 'soul-hud')) {
    $jar = $null
    # libs/ = remapped (runtime-ready); devlibs/ = fallback for older loom
    foreach ($sub in @('libs', 'devlibs')) {
      $dir = Join-Path $Repo "soul-mods\$mod\build\$mc\$sub"
      if (-not (Test-Path $dir)) { continue }
      $jar = Get-ChildItem $dir -Filter "$mod-*-$mc.jar" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch 'sources|dev' } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
      if ($jar) { break }
    }
    if ($jar) { $jars += $jar }
  }
  return $jars
}

$OptionsTxt = @'
renderDistance:12
simulationDistance:8
maxFps:260
enableVsync:false
pauseOnLostFocus:true
graphicsMode:1
'@

$Versions = @()
$Versions += [pscustomobject]@{
  id = '26.2'; name = 'Soul Client 26.2'; mcVersion = '26.2'; loaderVersion = '0.19.5'
  zip = 'client/version-26.2/soul-client-26-2.zip'; modCount = 24; released = '2026-09-10'
  notes = 'Tuned Fabric FPS build with 24 performance, stability, and options mods.'
}

foreach ($mc in @('1.21.1', '1.21.10', '1.21.11', '26.1.2')) {
  $slug = $mc -replace '[^\w]', '-'
  $index = Get-OneClientIndex $mc
  $SoulModJars = @(Get-SoulModJars $mc)
  if ($SoulModJars.Count -gt 0) {
    Write-Host "Custom mods for ${mc}: $($SoulModJars.Name -join ', ')"
  } else {
    Write-Warning "No custom jars found for $mc - build client/soul-mods with -Pmcver=$mc first."
  }

  # Keep the public files we curated, taken from OneClient's own resolved list.
  $files = @()
  $matched = @{}
  foreach ($f in $index.files) {
    $url = [string]$f.downloads[0]
    if ($url -match '/data/([^/]+)/') {
      $projectId = $Matches[1]
      if ($ModIds.ContainsKey($projectId)) {
        $files += $f
        $matched[$projectId] = $true
      }
    }
  }
  if ($files.Count -lt 15) { throw "Only $($files.Count) curated mods found for $mc - OneClient list changed?" }
  $versionMods = @($Mods | Where-Object { $matched.ContainsKey($_.id) })
  Write-Host "$mc : $($files.Count) public mods"

  # --- .mrpack for local installs (Library -> Import -> modpack) ---
  $packStage = Join-Path $Tmp ('mrpack-' + $slug)
  $overrideDir = Join-Path $packStage 'overrides'
  New-Item -ItemType Directory -Force -Path (Join-Path $overrideDir 'mods') | Out-Null
  Set-Content -Path (Join-Path $overrideDir 'options.txt') -Value $OptionsTxt -Encoding ASCII
  $bundled = 0
  foreach ($jar in $SoulModJars) {
    Copy-Item $jar.FullName (Join-Path $overrideDir ('mods\' + $jar.Name)) -Force
    $bundled++
  }
  $mrIndex = [ordered]@{
    formatVersion = 1
    game = 'minecraft'
    versionId = "1.0.0+$slug"
    name = "Soul Client $mc"
    summary = 'Soul Client by Soul Launcher - tuned Fabric build with a custom UI.'
    files = $files
    dependencies = [ordered]@{ minecraft = $mc; 'fabric-loader' = '0.19.5' }
  }
  Write-JsonFile (Join-Path $packStage 'modrinth.index.json') $mrIndex 12
  $mrOut = Join-Path $ClientDir ("Soul-Client-$mc.mrpack")
  if (Test-Path $mrOut) { Remove-Item $mrOut -Force }
  [System.IO.Compression.ZipFile]::CreateFromDirectory($packStage, $mrOut, [System.IO.Compression.CompressionLevel]::Optimal, $false)
  Write-Host "  -> $([System.IO.Path]::GetFileName($mrOut))"

  # --- Soul Client zip used by the in-app Soul Client card ---
  $zipStage = Join-Path $Tmp ('zip-' + $slug)
  New-Item -ItemType Directory -Force -Path (Join-Path $zipStage 'mods') | Out-Null
  Set-Content -Path (Join-Path $zipStage 'options.txt') -Value $OptionsTxt -Encoding ASCII
  foreach ($jar in $SoulModJars) { Copy-Item $jar.FullName (Join-Path $zipStage ('mods\' + $jar.Name)) -Force }
  $manifest = [ordered]@{
    name = 'Soul Client'
    version = $mc
    mcVersion = $mc
    loader = 'fabric'
    loaderVersion = '0.19.5'
    description = "$($versionMods.Count) public Modrinth mods$(if ($bundled) { ' + custom Soul Client mods' } else { '' })."
    ramGb = 4
    bundleIncluded = ($bundled -gt 0)
    mods = @($versionMods | ForEach-Object { [ordered]@{ source = 'modrinth'; projectId = $_.id; title = $_.title } })
  }
  Write-JsonFile (Join-Path $zipStage 'soul-client.json') $manifest 8
  $versionDir = Join-Path $Repo ("version-$mc")
  New-Item -ItemType Directory -Force -Path $versionDir | Out-Null
  $zipOut = Join-Path $versionDir "soul-client-$slug.zip"
  if (Test-Path $zipOut) { Remove-Item $zipOut -Force }
  [System.IO.Compression.ZipFile]::CreateFromDirectory($zipStage, $zipOut, [System.IO.Compression.CompressionLevel]::Optimal, $false)
  Write-Host "  -> client/version-$mc/$(Split-Path $zipOut -Leaf)"

  $Versions += [pscustomobject]@{
    id = $mc; name = "Soul Client $mc"; mcVersion = $mc; loaderVersion = '0.19.5'
    zip = "client/version-$mc/$(Split-Path $zipOut -Leaf)"
    modCount = $versionMods.Count + $bundled
    released = $Now
    notes = "$($versionMods.Count) public Modrinth mods$(if ($bundled) { ' and the custom Soul Client mods' } else { '' })."
  }
}

Write-JsonFile (Join-Path $Repo 'versions.json') ([ordered]@{ versions = $Versions }) 4
Write-Host 'Wrote client/versions.json'
Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'Done.'
