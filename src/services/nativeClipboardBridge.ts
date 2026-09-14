import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';

/**
 * Android WebViews can expose navigator.clipboard, but reading it may be
 * restricted by WebView/browser permission rules. When running natively,
 * route readText() through Capacitor's native Clipboard plugin instead.
 */
export function installNativeClipboardBridge(): void {
  if (typeof navigator === 'undefined' || !Capacitor.isNativePlatform()) return;

  try {
    const existing = navigator.clipboard;

    if (existing) {
      existing.readText = async () => {
        const { value } = await Clipboard.read();
        return value || '';
      };
    } else {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        enumerable: true,
        value: {
          readText: async () => {
            const { value } = await Clipboard.read();
            return value || '';
          },
        },
      });
    }

    // Keep the existing verification logic, but replace the oversized text
    // clipboard control with a compact clipboard icon. The existing click
    // handler remains attached, so it still performs the native clipboard read.
    const compactClipboardButton = () => {
      const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
      buttons.forEach((button) => {
        const text = button.textContent?.trim() || '';
        if (text !== 'Paste Code from Clipboard') return;
        if (button.dataset.tokencareClipboardIcon === 'true') return;

        button.dataset.tokencareClipboardIcon = 'true';
        button.setAttribute('aria-label', 'Paste verification code from clipboard');
        button.setAttribute('title', 'Paste verification code from clipboard');
        button.className = 'inline-flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer';
        button.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
          </svg>`;
      });
    };

    const observer = new MutationObserver(compactClipboardButton);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(compactClipboardButton, 0);
  } catch (error) {
    console.warn('[TokenCare] Native clipboard bridge unavailable:', error);
  }
}
