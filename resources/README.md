# TokenCare native branding sources

This directory is the **only place you should replace native branding source images**.

## Files to maintain

- `icon.png` — one master TokenCare Android/app icon. Do not upload separate mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi files.
- `splash.png` — one master native splash artwork. Do not upload separate portrait/landscape/density splash files.

Run `npm run assets:generate` after replacing either source image. The Capacitor Assets tool generates the Android density/adaptive resources from these two source files.

The generated files under `android/app/src/main/res/` are build outputs. Do not edit them by hand.

## Recommended source files

- PNG format.
- `icon.png`: square, high resolution, with the logo centered and safe margins for adaptive-icon cropping.
- `splash.png`: high-resolution artwork with the selected dark background already included.

Status-bar and navigation-bar colors are separate from these branding assets and should not be edited here.
