# Generate PWA icons with built-in System.Drawing (no extra packages).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-icons.ps1
Add-Type -AssemblyName System.Drawing

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-Icon([int]$size, [string]$outPath, [bool]$maskable) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = $size / 512.0
  $radius = if ($maskable) { 0 } else { 112 * $s }

  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, `
    ([System.Drawing.Color]::FromArgb(255, 37, 99, 235)), `
    ([System.Drawing.Color]::FromArgb(255, 23, 37, 84)), 55.0
  if ($radius -gt 0) {
    $bgPath = New-RoundedPath 0 0 $size $size $radius
    $g.FillPath($bg, $bgPath)
  }
  else {
    $g.FillRectangle($bg, $rect)
  }

  $scale = if ($maskable) { 0.82 } else { 1.0 }
  $cx = $size / 2.0
  $cy = $size / 2.0
  $cw = 320 * $s * $scale
  $ch = 210 * $s * $scale
  $cardX = $cx - $cw / 2
  $cardY = $cy - $ch / 2 - 18 * $s * $scale

  $cardPath = New-RoundedPath $cardX $cardY $cw $ch (28 * $s)
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $g.FillPath($white, $cardPath)

  $g.SetClip($cardPath)
  $band = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 37, 99, 235))
  $g.FillRectangle($band, $cardX, $cardY, $cw, 58 * $s * $scale)
  $g.ResetClip()

  $line1 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 203, 213, 225))
  $line2 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 226, 232, 240))
  $g.FillRectangle($line1, $cardX + 30 * $s, $cardY + 88 * $s * $scale, $cw - 60 * $s, 22 * $s * $scale)
  $g.FillRectangle($line2, $cardX + 30 * $s, $cardY + 128 * $s * $scale, $cw * 0.55, 18 * $s * $scale)

  $r = 62 * $s * $scale
  $gx = $cx + $cw / 2 - 8 * $s
  $gy = $cardY + $ch + 8 * $s
  $green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 34, 197, 94))
  $g.FillEllipse($green, $gx - $r, $gy - $r, $r * 2, $r * 2)

  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), (14 * $s * $scale)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $p1 = New-Object System.Drawing.PointF ($gx - $r * 0.42), ($gy - $r * 0.02)
  $p2 = New-Object System.Drawing.PointF ($gx - $r * 0.10), ($gy + $r * 0.32)
  $p3 = New-Object System.Drawing.PointF ($gx + $r * 0.46), ($gy - $r * 0.34)
  $pts = @($p1, $p2, $p3)
  $g.DrawLines($pen, $pts)

  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "wrote $outPath"
}

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
New-Icon 192 (Join-Path $root 'icons/icon-192.png') $false
New-Icon 512 (Join-Path $root 'icons/icon-512.png') $false
New-Icon 512 (Join-Path $root 'icons/icon-maskable-512.png') $true
