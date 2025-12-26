# App Icons

Place your app icons in this directory:

## Required Icon Files:

1. **icon.icns** - For macOS (Apple Icon Image format)
   - Recommended sizes: 512x512, 256x256, 128x128, 64x64, 32x32, 16x16
   - You can create this from a PNG using tools like:
     - `iconutil` (built into macOS): `iconutil -c icns icon.iconset`
     - Online converters
     - Image2icon app

2. **icon.ico** - For Windows
   - Recommended sizes: 256x256, 128x128, 64x64, 48x48, 32x32, 16x16
   - You can create this from a PNG using:
     - Online converters (e.g., convertio.co, ico-convert.com)
     - ImageMagick: `convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`

3. **icon.png** - For Linux
   - Recommended size: 512x512 or 1024x1024
   - PNG format with transparency support

## Quick Setup:

If you have a single PNG icon (1024x1024 recommended), you can:
1. Place it as `icon.png` in this directory
2. Use online tools or command-line tools to convert it to .icns and .ico formats
3. Or uncomment the single `icon: build/icon.png` line in electron-builder.yml and electron-builder will auto-generate platform icons

## Tools for Creating Icons:

- **macOS**: Use `iconutil` command or apps like Image2icon
- **Windows**: Use online converters or ImageMagick
- **Online**: https://convertio.co/, https://www.icoconverter.com/

