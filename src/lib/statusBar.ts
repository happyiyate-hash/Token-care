import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

const DEFAULT_APP_BACKGROUND = '#06080E';
const DEFAULT_HEADER_BACKGROUND = '#090C12';
const VIEW_MODE_KEY = 'tokencare_view_mode';
const VIEW_MODE_CONTROL_ID = 'tokencare-view-mode-control';

function isTransparent(color: string): boolean { return !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)'; }
function isDarkColor(colorStr: string): boolean {
  if (!colorStr) return true;
  const clean = colorStr.trim().toLowerCase();
  if (clean.startsWith('#')) {
    let hex = clean.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length >= 6) {
      const r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.6;
    }
  } else if (clean.startsWith('rgb')) {
    const match = clean.match(/\d+/g);
    if (match && match.length >= 3) {
      const r = parseInt(match[0], 10), g = parseInt(match[1], 10), b = parseInt(match[2], 10);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.6;
    }
  }
  return true;
}
function normalizeToHex(colorStr: string): string {
  if (!colorStr || isTransparent(colorStr)) return DEFAULT_APP_BACKGROUND;
  const clean = colorStr.trim().toLowerCase();
  if (clean.startsWith('#')) { let hex = clean.slice(1); if (hex.length === 3) hex = hex.split('').map((c) => c + c).join(''); return `#${hex.slice(0, 6)}`; }
  const rgb = clean.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return `#${Number(rgb[1]).toString(16).padStart(2, '0')}${Number(rgb[2]).toString(16).padStart(2, '0')}${Number(rgb[3]).toString(16).padStart(2, '0')}`;
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
  for (const element of candidates) { if (element.getClientRects().length === 0) continue; const color = getComputedBackground(element); if (color) return color; const nestedColor = getComputedBackground(element.querySelector<HTMLElement>('[class*="bg-"]')); if (nestedColor) return nestedColor; }
  return '';
}
function getFirstVisibleElement(root: HTMLElement | null, selector: string): HTMLElement | null { if (!root) return null; return Array.from(root.querySelectorAll<HTMLElement>(selector)).find((element) => element.getClientRects().length > 0) || null; }
function resolveSystemBarColors(requestedColor: string): { top: string; bottom: string } {
  if (typeof document === 'undefined') return { top: requestedColor || DEFAULT_HEADER_BACKGROUND, bottom: requestedColor || DEFAULT_APP_BACKGROUND };
  const root = document.querySelector<HTMLElement>('#root');
  const shell = root?.querySelector<HTMLElement>(':scope > .h-screen') || null;
  const header = shell?.querySelector<HTMLElement>(':scope > header') || getFirstVisibleElement(root, 'header');
  const nav = shell?.querySelector<HTMLElement>(':scope > nav') || getFirstVisibleElement(root, 'nav');
  const main = shell?.querySelector<HTMLElement>(':scope > main') || getFirstVisibleElement(root, 'main');
  const headerColor = getComputedBackground(header), contentColor = getFirstVisibleContentBackground(main), bodyColor = getComputedBackground(document.body), requested = normalizeToHex(requestedColor || DEFAULT_HEADER_BACKGROUND);
  return { top: headerColor || contentColor || bodyColor || requested || DEFAULT_HEADER_BACKGROUND, bottom: getComputedBackground(nav) || contentColor || bodyColor || requested || DEFAULT_APP_BACKGROUND };
}
async function applyStatusBar(color: string) {
  const { top } = resolveSystemBarColors(color);
  const isDark = isDarkColor(top), isNative = Capacitor.isNativePlatform();
  if (typeof document !== 'undefined') {
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) { metaThemeColor = document.createElement('meta'); metaThemeColor.setAttribute('name', 'theme-color'); document.head.appendChild(metaThemeColor); }
    metaThemeColor.setAttribute('content', top);
    document.documentElement.style.setProperty('--system-top-bg', top);
    document.documentElement.style.setProperty('--system-bottom-bg', resolveSystemBarColors(color).bottom);
    document.documentElement.style.setProperty('--status-bar-bg', top);
    document.documentElement.classList.toggle('native-status-bar', isNative);
  }
  if (isNative) { try { await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }); if (Capacitor.getPlatform() === 'android') { await StatusBar.setBackgroundColor({ color: '#00000000' }); await StatusBar.setOverlaysWebView({ overlay: true }); } } catch {} }
}

function installViewModeController() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if ((window as any).__tokencareViewModeControllerInstalled) return;
  (window as any).__tokencareViewModeControllerInstalled = true;
  const originalInnerWidth = window.innerWidth;
  let forcedWidth: number | null = null;
  let observer: MutationObserver | null = null;
  const getMode = (): 'desktop' | 'mobile' => { const saved = localStorage.getItem(VIEW_MODE_KEY); if (saved === 'desktop' || saved === 'mobile') return saved; return forcedWidth !== null ? (forcedWidth < 768 ? 'mobile' : 'desktop') : (window.innerWidth < 768 ? 'mobile' : 'desktop'); };
  const setForcedViewport = (mode: 'desktop' | 'mobile') => { forcedWidth = mode === 'mobile' ? 390 : Math.max(1024, originalInnerWidth); try { Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => forcedWidth ?? originalInnerWidth }); } catch {} window.dispatchEvent(new Event('resize')); };
  const restoreNaturalViewport = () => { forcedWidth = null; try { Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => originalInnerWidth }); } catch {} window.dispatchEvent(new Event('resize')); };
  const isSettingsVisible = () => {
    const text = document.body?.innerText?.toLowerCase() || '';
    return text.includes('manage your account and preferences') || text.includes('appearance') || text.includes('wallet & security');
  };
  const removeControl = () => document.getElementById(VIEW_MODE_CONTROL_ID)?.remove();
  const renderControl = () => {
    if (!isSettingsVisible()) { removeControl(); return; }
    let button = document.getElementById(VIEW_MODE_CONTROL_ID) as HTMLButtonElement | null;
    if (!button) {
      button = document.createElement('button');
      button.id = VIEW_MODE_CONTROL_ID;
      button.type = 'button';
      button.setAttribute('aria-label', 'Switch app preview layout');
      button.style.cssText = 'position:fixed;right:16px;bottom:92px;z-index:2147483646;display:flex;align-items:center;gap:9px;padding:11px 15px;border-radius:15px;border:1px solid rgba(52,211,153,.35);background:rgba(9,12,18,.97);backdrop-filter:blur(16px);box-shadow:0 10px 35px rgba(0,0,0,.5);color:#e5e7eb;font:600 12px/1 system-ui,sans-serif;cursor:pointer;';
      document.body.appendChild(button);
      button.addEventListener('click', () => { const next = getMode() === 'mobile' ? 'desktop' : 'mobile'; localStorage.setItem(VIEW_MODE_KEY, next); setForcedViewport(next); renderControl(); });
    }
    const mode = getMode();
    button.innerHTML = mode === 'mobile' ? '<span style="font-size:16px">▣</span><span>Switch to Desktop</span>' : '<span style="font-size:16px">▯</span><span>Switch to Mobile</span>';
    button.title = mode === 'mobile' ? 'Preview the desktop layout' : 'Preview the mobile layout';
  };
  const saved = localStorage.getItem(VIEW_MODE_KEY);
  if (saved === 'mobile' || saved === 'desktop') setForcedViewport(saved);
  observer = new MutationObserver(() => window.requestAnimationFrame(renderControl));
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  renderControl();
  window.addEventListener('beforeunload', () => { observer?.disconnect(); restoreNaturalViewport(); }, { once: true });
}

export async function setStatusBarColor(color: string) { if (!color) return; installViewModeController(); await applyStatusBar(color); }
export function useStatusBarColor(color: string) {
  useEffect(() => {
    let disposed = false; let refreshTimer: number | undefined;
    const refresh = () => { if (disposed) return; window.clearTimeout(refreshTimer); refreshTimer = window.setTimeout(() => { installViewModeController(); applyStatusBar(color).catch(() => {}); }, 0); };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { disposed = true; window.clearTimeout(refreshTimer); observer.disconnect(); };
  }, [color]);
}
