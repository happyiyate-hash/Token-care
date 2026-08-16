import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

const DEFAULT_APP_BACKGROUND = '#06080E';
const DEFAULT_HEADER_BACKGROUND = '#090C12';

function isTransparent(color: string): boolean {
  return !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
}

function isDarkColor(colorStr: string): boolean {
  if (!colorStr) return true;
  const clean = colorStr.trim().toLowerCase();

  if (clean.startsWith('#')) {
    let hex = clean.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length >= 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.6;
    }
  } else if (clean.startsWith('rgb')) {
    const match = clean.match(/\d+/g);
    if (match && match.length >= 3) {
      const r = parseInt(match[0], 10);
      const g = parseInt(match[1], 10);
      const b = parseInt(match[2], 10);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.6;
    }
  }

  return true;
}

function normalizeToHex(colorStr: string): string {
  if (!colorStr || isTransparent(colorStr)) return DEFAULT_APP_BACKGROUND;
  const clean = colorStr.trim().toLowerCase();

  if (clean.startsWith('#')) {
    let hex = clean.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    return `#${hex.slice(0, 6)}`;
  }

  const rgb = clean.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    const r = Number(rgb[1]).toString(16).padStart(2, '0');
    const g = Number(rgb[2]).toString(16).padStart(2, '0');
    const b = Number(rgb[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  return DEFAULT_APP_BACKGROUND;
}

function getComputedBackground(element: Element | null): string {
  if (!element || !(element instanceof HTMLElement)) return '';
  const color = window.getComputedStyle(element).backgroundColor;
  return isTransparent(color) ? '' : normalizeToHex(color);
}

function getFirstVisibleContentBackground(main: HTMLElement | null): string {
  if (!main) return '';

  const candidates = [main, ...Array.from(main.querySelectorAll<HTMLElement>(':scope > *'))];
  for (const element of candidates) {
    if (element.getClientRects().length === 0) continue;
    const color = getComputedBackground(element);
    if (color) return color;

    const nested = element.querySelector<HTMLElement>('[class*="bg-"]');
    const nestedColor = getComputedBackground(nested);
    if (nestedColor) return nestedColor;
  }

  return '';
}

function getFirstVisibleElement(root: HTMLElement | null, selector: string): HTMLElement | null {
  if (!root) return null;
  const elements = Array.from(root.querySelectorAll<HTMLElement>(selector));
  return elements.find((element) => element.getClientRects().length > 0) || null;
}

function resolveSystemBarColors(requestedColor: string): { top: string; bottom: string } {
  if (typeof document === 'undefined') {
    return {
      top: requestedColor || DEFAULT_HEADER_BACKGROUND,
      bottom: requestedColor || DEFAULT_APP_BACKGROUND,
    };
  }

  const root = document.querySelector<HTMLElement>('#root');
  const shell = root?.querySelector<HTMLElement>(':scope > .h-screen') || null;
  const header =
    shell?.querySelector<HTMLElement>(':scope > header') ||
    getFirstVisibleElement(root, 'header');
  const nav =
    shell?.querySelector<HTMLElement>(':scope > nav') ||
    getFirstVisibleElement(root, 'nav');
  const main = shell?.querySelector<HTMLElement>(':scope > main') || getFirstVisibleElement(root, 'main');

  const headerColor = getComputedBackground(header);
  const contentColor = getFirstVisibleContentBackground(main);
  const bodyColor = getComputedBackground(document.body);
  const requested = normalizeToHex(requestedColor || DEFAULT_HEADER_BACKGROUND);

  const top = headerColor || contentColor || bodyColor || requested || DEFAULT_HEADER_BACKGROUND;
  const bottom = getComputedBackground(nav) || contentColor || bodyColor || requested || DEFAULT_APP_BACKGROUND;

  return { top, bottom };
}

async function applyStatusBar(color: string) {
  const { top, bottom } = resolveSystemBarColors(color);
  const isDark = isDarkColor(top);
  const isNative = Capacitor.isNativePlatform();

  if (typeof document !== 'undefined') {
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', top);

    // These variables paint the same colors directly in the app surface under
    // Android's transparent system bars. There is no separate fake bar.
    document.documentElement.style.setProperty('--system-top-bg', top);
    document.documentElement.style.setProperty('--system-bottom-bg', bottom);
    document.documentElement.style.setProperty('--status-bar-bg', top);
    document.documentElement.classList.toggle('native-status-bar', isNative);
  }

  if (isNative) {
    try {
      await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });

      if (Capacitor.getPlatform() === 'android') {
        // Android owns these areas. Keep them transparent so the WebView's
        // header/background/nav surface is what the user actually sees.
        await StatusBar.setBackgroundColor({ color: '#00000000' });
        await StatusBar.setOverlaysWebView({ overlay: true });
      }
    } catch {
      // Gracefully ignore unsupported browser/simulator/native versions.
    }
  }
}

export async function setStatusBarColor(color: string) {
  if (!color) return;
  await applyStatusBar(color);
}

export function useStatusBarColor(color: string) {
  useEffect(() => {
    let disposed = false;
    let refreshTimer: number | undefined;

    const refresh = () => {
      if (disposed) return;
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        applyStatusBar(color).catch(() => {});
      }, 0);
    };

    refresh();

    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      window.clearTimeout(refreshTimer);
      observer.disconnect();
    };
  }, [color]);
}
