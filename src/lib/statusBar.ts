import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

const DEFAULT_APP_BACKGROUND = '#06080E';
const DEFAULT_HEADER_BACKGROUND = '#090C12';
const VIEW_MODE_KEY = 'tokencare_view_mode';
const VIEW_MODE_BUTTON_ID = 'tokencare-settings-view-mode';

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
    return { top: requestedColor || DEFAULT_HEADER_BACKGROUND, bottom: requestedColor || DEFAULT_APP_BACKGROUND };
  }
  const root = document.querySelector<HTMLElement>('#root');
  const shell = root?.querySelector<HTMLElement>(':scope > .h-screen') || null;
  const header = shell?.querySelector<HTMLElement>(':scope > header') || getFirstVisibleElement(root, 'header');
  const nav = shell?.querySelector<HTMLElement>(':scope > nav') || getFirstVisibleElement(root, 'nav');
  const main = shell?.querySelector<HTMLElement>(':scope > main') || getFirstVisibleElement(root, 'main');
  const headerColor = getComputedBackground(header);
  const contentColor = getFirstVisibleContentBackground(main);
  const bodyColor = getComputedBackground(document.body);
  const requested = normalizeToHex(requestedColor || DEFAULT_HEADER_BACKGROUND);
  return {
    top: headerColor || contentColor || bodyColor || requested || DEFAULT_HEADER_BACKGROUND,
    bottom: getComputedBackground(nav) || contentColor || bodyColor || requested || DEFAULT_APP_BACKGROUND,
  };
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
    document.documentElement.style.setProperty('--system-top-bg', top);
    document.documentElement.style.setProperty('--system-bottom-bg', bottom);
    document.documentElement.style.setProperty('--status-bar-bg', top);
    document.documentElement.classList.toggle('native-status-bar', isNative);
  }

  if (isNative) {
    try {
      await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
      if (Capacitor.getPlatform() === 'android') {
        await StatusBar.setBackgroundColor({ color: '#00000000' });
        await StatusBar.setOverlaysWebView({ overlay: true });
      }
    } catch {
      // Ignore unsupported browser/simulator/native versions.
    }
  }
}

function getSavedMode(): 'desktop' | 'mobile' | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return saved === 'desktop' || saved === 'mobile' ? saved : null;
  } catch {
    return null;
  }
}

function forceViewportWidth(mode: 'desktop' | 'mobile') {
  if (typeof window === 'undefined') return;
  const width = mode === 'mobile' ? 390 : Math.max(window.screen?.width || 1024, 1024);
  try {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      get: () => width,
    });
  } catch {
    // Some browsers expose innerWidth as non-configurable.
  }
}

// App.tsx chooses its React tree from window.innerWidth during initial render.
// Apply a saved preview mode before React renders so the preference survives reloads.
if (typeof window !== 'undefined') {
  const savedMode = getSavedMode();
  if (savedMode) forceViewportWidth(savedMode);
}

function isSettingsPage(): boolean {
  if (typeof document === 'undefined') return false;
  const text = document.body.innerText.toLowerCase();
  return (
    text.includes('manage your account and preferences') ||
    text.includes('wallet & security') && text.includes('appearance')
  );
}

function installSettingsViewModeControl() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if ((window as any).__tokencareViewModeControlInstalled) return;
  (window as any).__tokencareViewModeControlInstalled = true;

  const remove = () => document.getElementById(VIEW_MODE_BUTTON_ID)?.remove();

  const render = () => {
    if (!isSettingsPage()) {
      remove();
      return;
    }

    const currentMode: 'desktop' | 'mobile' = getSavedMode() || (window.innerWidth < 768 ? 'mobile' : 'desktop');
    const nextMode = currentMode === 'mobile' ? 'desktop' : 'mobile';
    let button = document.getElementById(VIEW_MODE_BUTTON_ID) as HTMLButtonElement | null;

    if (!button) {
      button = document.createElement('button');
      button.id = VIEW_MODE_BUTTON_ID;
      button.type = 'button';
      button.setAttribute('aria-label', `Switch to ${nextMode} view`);
      button.addEventListener('click', () => {
        const next: 'desktop' | 'mobile' = (getSavedMode() || (window.innerWidth < 768 ? 'mobile' : 'desktop')) === 'mobile' ? 'desktop' : 'mobile';
        try {
          localStorage.setItem(VIEW_MODE_KEY, next);
        } catch {}
        forceViewportWidth(next);
        // Reload is intentional: App.tsx selects the correct React layout during
        // its initial render, so the switch is reliable on every route/device.
        window.location.reload();
      });
      document.body.appendChild(button);
    }

    button.innerHTML = nextMode === 'mobile'
      ? '<span style="font-size:16px;line-height:1">▯</span><span>Switch to Mobile</span>'
      : '<span style="font-size:16px;line-height:1">▣</span><span>Switch to Desktop</span>';
    button.title = `Switch to ${nextMode} view`;
    button.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:calc(env(safe-area-inset-bottom, 0px) + 74px)',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'padding:11px 14px',
      'border-radius:14px',
      'border:1px solid rgba(52,211,153,.30)',
      'background:rgba(9,12,18,.96)',
      'backdrop-filter:blur(16px)',
      'box-shadow:0 10px 35px rgba(0,0,0,.48)',
      'color:#e5e7eb',
      'font:600 12px/1 system-ui,sans-serif',
      'cursor:pointer',
    ].join(';');
  };

  const observer = new MutationObserver(() => window.requestAnimationFrame(render));
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  render();
}

export async function setStatusBarColor(color: string) {
  if (!color) return;
  installSettingsViewModeControl();
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
        installSettingsViewModeControl();
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
