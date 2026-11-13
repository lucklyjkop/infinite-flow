param([string]$Ffmpeg = 'ffmpeg')
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $project 'art-source/imagegen/player-profile'
$destinationDirectory = Join-Path $project 'loading-page/assets/player-profile'
$scratchDirectory = Join-Path $project 'output/profile-art'
New-Item -ItemType Directory -Force -Path $destinationDirectory,$scratchDirectory | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class ProfileAlphaBounds {
  public static Rectangle Find(Bitmap image) {
    var rect = new Rectangle(0, 0, image.Width, image.Height);
    var data = image.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    try {
      var pixels = new byte[data.Stride * image.Height];
      Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
      int left=image.Width, top=image.Height, right=0, bottom=0;
      for(int y=0;y<image.Height;y++) for(int x=0;x<image.Width;x++) {
        if(pixels[y*data.Stride+x*4+3] <= 16) continue;
        left=Math.Min(left,x); top=Math.Min(top,y); right=Math.Max(right,x); bottom=Math.Max(bottom,y);
      }
      if(left>right) return rect;
      left=Math.Max(0,left-3); top=Math.Max(0,top-3);
      return Rectangle.FromLTRB(left,top,Math.Min(image.Width,right+4),Math.Min(image.Height,bottom+4));
    } finally { image.UnlockBits(data); }
  }
}
'@ -ReferencedAssemblies System.Drawing
$manifestPath = Join-Path $sourceDirectory 'ui-generation-v2.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$sizes = @{ 'personal-emblem'=256; 'portrait-frame'=600; 'silk-tab'=1200; 'silk-input'=1400; 'silk-panel'=1500; 'profile-backdrop-warm'=1672; 'profile-backdrop-final'=1672 }
$processed = @()
foreach($asset in $manifest.assets) {
  $source = Join-Path $sourceDirectory ($asset.name + '.png')
  if(!(Test-Path -LiteralPath $source)) { Copy-Item -LiteralPath $asset.source -Destination $source }
  $bitmap = [System.Drawing.Bitmap]::FromFile($source)
  try {
    $bounds = if($asset.transparent_background) { [ProfileAlphaBounds]::Find($bitmap) } else { [System.Drawing.Rectangle]::new(0,0,$bitmap.Width,$bitmap.Height) }
    $cropped = $bitmap.Clone($bounds,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $tempPath = Join-Path $scratchDirectory ($asset.name + '.png')
    try { $cropped.Save($tempPath,[System.Drawing.Imaging.ImageFormat]::Png) } finally { $cropped.Dispose() }
    $width = [Math]::Min($sizes[$asset.name],$bounds.Width)
    $output = Join-Path $destinationDirectory ($asset.name + '.webp')
    & $Ffmpeg -hide_banner -loglevel error -y -i $tempPath -vf "scale=${width}:-1:flags=lanczos" -c:v libwebp -quality 91 -compression_level 6 $output
    if($LASTEXITCODE -ne 0) { throw "Failed encoding $($asset.name)" }
    $processed += @{ name=$asset.name; crop=@{x=$bounds.X;y=$bounds.Y;width=$bounds.Width;height=$bounds.Height}; runtimeWidth=$width; codec='WebP'; quality=91 }
  } finally { $bitmap.Dispose() }
}
$metadata = ($processed | ConvertTo-Json -Depth 5).Replace("`r`n", "`n") + "`n"
[IO.File]::WriteAllText((Join-Path $sourceDirectory 'runtime-processing-v2.json'), $metadata, [Text.UTF8Encoding]::new($false))
$processed | ForEach-Object { Write-Output "$($_.name): $($_.crop.width)x$($_.crop.height) -> $($_.runtimeWidth)px" }
