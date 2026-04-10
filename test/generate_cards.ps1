# Generate SVG card images for all 52 playing cards + card back
# Output: images/cards/{suit}_{rank}.svg and images/cards/back.svg

$outputDir = "C:\Users\uta_0\.antigravity\test\images\cards"
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$suits = @("spades", "hearts", "clubs", "diamonds")
$ranks = @("A","2","3","4","5","6","7","8","9","10","J","Q","K")

$suitEntities = @{
    "spades"   = "&#x2660;"
    "hearts"   = "&#x2665;"
    "clubs"    = "&#x2663;"
    "diamonds" = "&#x2666;"
}

$suitColors = @{
    "spades"   = "#0f172a"
    "hearts"   = "#dc2626"
    "clubs"    = "#0f172a"
    "diamonds" = "#dc2626"
}

# Return pip positions as a flat list of [x1,y1, x2,y2, ...]
function Get-PipXY($rank) {
    switch ($rank) {
        "A"  { return @(100,140) }
        "2"  { return @(100,70,  100,210) }
        "3"  { return @(100,70,  100,140, 100,210) }
        "4"  { return @(60,70,   140,70,  60,210,  140,210) }
        "5"  { return @(60,70,   140,70,  100,140, 60,210,  140,210) }
        "6"  { return @(60,70,   140,70,  60,140,  140,140, 60,210,  140,210) }
        "7"  { return @(60,70,   140,70,  60,140,  140,140, 100,107, 60,210,  140,210) }
        "8"  { return @(60,70,   140,70,  60,140,  140,140, 100,107, 100,175, 60,210,  140,210) }
        "9"  { return @(60,65,   140,65,  60,115,  140,115, 100,140, 60,165,  140,165, 60,215,  140,215) }
        "10" { return @(60,60,   140,60,  60,105,  140,105, 100,85,  60,165,  140,165, 100,195, 60,220,  140,220) }
        default { return @() }
    }
}

function Get-PipSvg($rank, $entity, $color) {
    $isFace = ($rank -eq "J" -or $rank -eq "Q" -or $rank -eq "K")
    if ($isFace) { return "" }

    $coords = Get-PipXY $rank
    $fontSize = if ($rank -eq "A") { "54" } else { "22" }
    $lines = ""

    for ($i = 0; $i -lt $coords.Length; $i += 2) {
        $x = $coords[$i]
        $y = $coords[$i+1]
        # Flip pips in the lower half (standard playing card convention), except Ace
        if ($y -gt 140 -and $rank -ne "A") {
            $lines += "  <text x=`"$x`" y=`"$y`" font-family=`"Arial,sans-serif`" font-size=`"$fontSize`" fill=`"$color`" text-anchor=`"middle`" dominant-baseline=`"middle`" transform=`"rotate(180,$x,$y)`">$entity</text>`n"
        } else {
            $lines += "  <text x=`"$x`" y=`"$y`" font-family=`"Arial,sans-serif`" font-size=`"$fontSize`" fill=`"$color`" text-anchor=`"middle`" dominant-baseline=`"middle`">$entity</text>`n"
        }
    }
    return $lines
}

function Get-FaceContent($rank, $entity, $color) {
    $bg     = if ($color -eq "#dc2626") { "#fff5f5" } else { "#f0f0ff" }
    $accent = if ($color -eq "#dc2626") { "#dc2626" } else { "#1e1b4b" }

    switch ($rank) {
        "J" {
@"
  <rect x="20" y="50" width="160" height="180" rx="4" fill="$bg" opacity="0.55"/>
  <text x="100" y="148" font-family="Georgia,serif" font-size="80" fill="$accent" text-anchor="middle" dominant-baseline="middle" opacity="0.85">J</text>
  <text x="100" y="200" font-family="Arial,sans-serif" font-size="30" fill="$color" text-anchor="middle" dominant-baseline="middle" opacity="0.5">$entity</text>
  <line x1="28" y1="64"  x2="172" y2="64"  stroke="$accent" stroke-width="1" opacity="0.25"/>
  <line x1="28" y1="216" x2="172" y2="216" stroke="$accent" stroke-width="1" opacity="0.25"/>
"@
        }
        "Q" {
@"
  <rect x="20" y="50" width="160" height="180" rx="4" fill="$bg" opacity="0.55"/>
  <polygon points="55,103 75,76 100,96 125,76 145,103 145,118 55,118" fill="$accent" opacity="0.7"/>
  <text x="100" y="170" font-family="Georgia,serif" font-size="70" fill="$accent" text-anchor="middle" dominant-baseline="middle" opacity="0.85">Q</text>
  <line x1="28" y1="64"  x2="172" y2="64"  stroke="$accent" stroke-width="1" opacity="0.25"/>
  <line x1="28" y1="216" x2="172" y2="216" stroke="$accent" stroke-width="1" opacity="0.25"/>
"@
        }
        "K" {
@"
  <rect x="20" y="50" width="160" height="180" rx="4" fill="$bg" opacity="0.55"/>
  <polygon points="45,103 65,72 100,92 135,72 155,103 155,122 45,122" fill="$accent" opacity="0.75"/>
  <circle cx="65"  cy="74" r="6" fill="#d4af37" opacity="0.9"/>
  <circle cx="100" cy="62" r="8" fill="#d4af37" opacity="0.9"/>
  <circle cx="135" cy="74" r="6" fill="#d4af37" opacity="0.9"/>
  <text x="100" y="182" font-family="Georgia,serif" font-size="70" fill="$accent" text-anchor="middle" dominant-baseline="middle" opacity="0.85">K</text>
  <line x1="28" y1="64"  x2="172" y2="64"  stroke="$accent" stroke-width="1" opacity="0.25"/>
  <line x1="28" y1="216" x2="172" y2="216" stroke="$accent" stroke-width="1" opacity="0.25"/>
"@
        }
    }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

foreach ($suit in $suits) {
    $entity = $suitEntities[$suit]
    $color  = $suitColors[$suit]

    foreach ($rank in $ranks) {
        $isFace = ($rank -eq "J" -or $rank -eq "Q" -or $rank -eq "K")
        
        if ($isFace) {
            $centerSvg = Get-FaceContent $rank $entity $color
        } else {
            $centerSvg = Get-PipSvg $rank $entity $color
        }

        $cfs  = if ($rank -eq "10") { "17" } else { "22" }
        $csfs = if ($rank -eq "10") { "13" } else { "16" }

        $svg = @"
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280" width="200" height="280">
  <defs>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   style="stop-color:#ffffff"/>
      <stop offset="100%" style="stop-color:#f1f5f9"/>
    </linearGradient>
  </defs>
  <!-- Card background -->
  <rect width="200" height="280" rx="12" fill="url(#cardBg)"/>
  <!-- Gold outer border -->
  <rect x="1" y="1" width="198" height="278" rx="11" fill="none" stroke="#d4af37" stroke-width="2"/>
  <!-- Subtle inner border -->
  <rect x="6" y="6" width="188" height="268" rx="8" fill="none" stroke="#d4af37" stroke-width="0.5" opacity="0.4"/>

  <!-- Top-left corner -->
  <text x="16" y="32" font-family="Georgia,serif" font-size="$cfs" font-weight="900" fill="$color" text-anchor="middle">$rank</text>
  <text x="16" y="52" font-family="Arial,sans-serif" font-size="$csfs" fill="$color" text-anchor="middle">$entity</text>

  <!-- Bottom-right corner (rotated 180deg) -->
  <text x="184" y="258" font-family="Georgia,serif" font-size="$cfs" font-weight="900" fill="$color" text-anchor="middle" transform="rotate(180,184,258)">$rank</text>
  <text x="184" y="238" font-family="Arial,sans-serif" font-size="$csfs" fill="$color" text-anchor="middle" transform="rotate(180,184,238)">$entity</text>

$centerSvg
</svg>
"@
        $filepath = Join-Path $outputDir "${suit}_${rank}.svg"
        [System.IO.File]::WriteAllText($filepath, $svg, $utf8NoBom)
        Write-Host "Generated: ${suit}_${rank}.svg"
    }
}

# --- Card Back ---
$backSvg = @'
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280" width="200" height="280">
  <defs>
    <linearGradient id="backBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   style="stop-color:#111827"/>
      <stop offset="100%" style="stop-color:#312e81"/>
    </linearGradient>
    <pattern id="dots" x="0" y="0" width="15" height="15" patternUnits="userSpaceOnUse">
      <circle cx="7.5" cy="7.5" r="2" fill="#d4af37" opacity="0.55"/>
    </pattern>
  </defs>
  <rect width="200" height="280" rx="12" fill="url(#backBg)"/>
  <rect x="1"  y="1"  width="198" height="278" rx="11" fill="none" stroke="#d4af37" stroke-width="2"/>
  <rect x="8"  y="8"  width="184" height="264" rx="8"  fill="none" stroke="#d4af37" stroke-width="1.5" opacity="0.6"/>
  <rect x="10" y="10" width="180" height="260" rx="6"  fill="url(#dots)"/>
  <!-- Center diamond ornament -->
  <polygon points="100,88 132,140 100,192 68,140" fill="none" stroke="#d4af37" stroke-width="2" opacity="0.35"/>
  <polygon points="100,104 118,140 100,176 82,140" fill="#d4af37" opacity="0.1"/>
  <!-- Corner marks -->
  <polygon points="22,20 30,28 22,36 14,28" fill="#d4af37" opacity="0.45"/>
  <polygon points="178,20 186,28 178,36 170,28" fill="#d4af37" opacity="0.45"/>
  <polygon points="22,244 30,252 22,260 14,252" fill="#d4af37" opacity="0.45"/>
  <polygon points="178,244 186,252 178,260 170,252" fill="#d4af37" opacity="0.45"/>
</svg>
'@

$backPath = Join-Path $outputDir "back.svg"
[System.IO.File]::WriteAllText($backPath, $backSvg, $utf8NoBom)
Write-Host "Generated: back.svg"
Write-Host "`nAll done! Generated $($suits.Count * $ranks.Count + 1) SVGs in: $outputDir"
