Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 16,16
$rim    = [System.Drawing.Color]::FromArgb(255,199,21,133)
$rim2   = [System.Drawing.Color]::FromArgb(255,233,30,99)
$body   = [System.Drawing.Color]::FromArgb(255,255,105,180)
$light  = [System.Drawing.Color]::FromArgb(255,255,182,193)
$heart  = [System.Drawing.Color]::FromArgb(255,255,240,245)
$clear  = [System.Drawing.Color]::FromArgb(0,0,0,0)
$cx = 7.5; $cy = 7.5
for ($y=0; $y -lt 16; $y++) {
  for ($x=0; $x -lt 16; $x++) {
    $dx = $x - $cx; $dy = $y - $cy
    $d = [Math]::Sqrt($dx*$dx + $dy*$dy)
    if ($d -gt 7.6) { $bmp.SetPixel($x,$y,$clear); continue }
    if ($d -gt 6.6) { $bmp.SetPixel($x,$y,$rim); continue }
    if ($d -gt 5.7) { $bmp.SetPixel($x,$y,$rim2); continue }
    if (($dx + $dy) -lt -3) { $bmp.SetPixel($x,$y,$light) } else { $bmp.SetPixel($x,$y,$body) }
  }
}
$rows = @(
  @(1,2,4,5),
  @(0,1,2,3,4,5,6),
  @(0,1,2,3,4,5,6),
  @(1,2,3,4,5),
  @(2,3,4),
  @(3)
)
for ($r=0; $r -lt $rows.Count; $r++) {
  foreach ($c in $rows[$r]) {
    $px = 4 + $c; $py = 4 + $r
    if ($px -ge 0 -and $px -lt 16 -and $py -ge 0 -and $py -lt 16) { $bmp.SetPixel($px,$py,$heart) }
  }
}
$out = Join-Path (Split-Path $PSScriptRoot -Parent) 'study_quiz_rp\textures\items\study_coin.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output ("SAVED " + $out + " exists=" + [System.IO.File]::Exists($out))
