# Generates pink "Study Quiz" pack icons (128x128) for the behavior + resource packs.
Add-Type -AssemblyName System.Drawing

function New-PackIcon {
    param([string]$OutPath)

    $size = 128
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    # Pink gradient background
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $c1 = [System.Drawing.Color]::FromArgb(255, 255, 143, 199)  # light pink (top)
    $c2 = [System.Drawing.Color]::FromArgb(255, 214, 51, 132)   # deep pink (bottom)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $c1, $c2, 90
    $g.FillRectangle($brush, $rect)

    # White coin circle
    $coin = New-Object System.Drawing.Rectangle 24, 18, 80, 80
    $coinBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 240, 247))
    $g.FillEllipse($coinBrush, $coin)
    $rimPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 199, 21, 133)), 5
    $g.DrawEllipse($rimPen, $coin)

    # Pink heart in the coin center
    $heartBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 105, 180))
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $cx = 64; $cy = 58
    $path.AddBezier($cx, ($cy - 4), ($cx - 18), ($cy - 22), ($cx - 34), ($cy + 2), $cx, ($cy + 26))
    $path.AddBezier($cx, ($cy + 26), ($cx + 34), ($cy + 2), ($cx + 18), ($cy - 22), $cx, ($cy - 4))
    $g.FillPath($heartBrush, $path)

    # "STUDY QUIZ" label
    $font = New-Object System.Drawing.Font "Segoe UI", 13, ([System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("STUDY QUIZ", $font, $textBrush, (New-Object System.Drawing.RectangleF 0, 100, 128, 24), $fmt)

    $g.Dispose()
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output ("SAVED " + $OutPath)
}

$root = Split-Path $PSScriptRoot -Parent
New-PackIcon -OutPath "$root\study_quiz_bp\pack_icon.png"
New-PackIcon -OutPath "$root\study_quiz_rp\pack_icon.png"
