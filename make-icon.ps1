Add-Type -AssemblyName System.Drawing
$size = 1024
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
# indigo rounded rect background
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(79, 70, 229))
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 220; $d = $r * 2
$rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$path.AddArc(0, 0, $d, $d, 180, 90)
$path.AddArc($size - $d, 0, $d, $d, 270, 90)
$path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
$path.AddArc(0, $size - $d, $d, $d, 90, 90)
$path.CloseFigure()
$g.FillPath($brush, $path)
# white "R"
$font = New-Object System.Drawing.Font('Segoe UI', 560, [System.Drawing.FontStyle]::Bold)
$white = [System.Drawing.Brushes]::White
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
$g.DrawString('R', $font, $white, (New-Object System.Drawing.RectangleF(0, -20, $size, $size)), $sf)
$g.Dispose()
$bmp.Save('C:\projects\remainder\icon-source.png', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"icon-source.png created"
