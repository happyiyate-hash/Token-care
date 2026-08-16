import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

const icon = 'resources/icon.png';
const splash = 'resources/splash.png';
const publicDir = 'public';

if (!existsSync(icon) || !existsSync(splash)) {
  console.error('Brand asset preparation aborted: resources/icon.png and resources/splash.png are required for native branding.');
  process.exit(1);
}

mkdirSync(publicDir, { recursive: true });

// The supplied icon is the source of truth for the PWA manifest/favicon/launcher branding.
// The supplied splash.png is reserved for the native Android/iOS splash screen.
// In-app loading/PWA content continues to use the existing CDN logo source.
copyFileSync(icon, 'public/icon.png');

console.log('TokenCare native/PWA shell branding prepared from resources/icon.png; native splash remains resources/splash.png.');
