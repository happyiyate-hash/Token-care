import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { App as CapApp } from '@capacitor/app';

export const isCapacitorNative = (): boolean => Capacitor.isNativePlatform();

export const getMobilePlatform = (): string => Capacitor.getPlatform();

// Keep the bottom navigation visually taller while preserving the Android
// gesture inset. This is intentionally scoped to the five-item mobile nav.
const installMobileBottomNavSizing = () => {
  if (typeof document === 'undefined') return;
  const styleId = 'tokencare-mobile-bottom-nav-sizing';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @media (max-width: 768px) {
      nav.shrink-0.z-50 {
        min-height: 96px !important;
        padding-top: 14px !important;
        padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 14px) !important;
      }
    }
  `;
  document.head.appendChild(style);
};

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installMobileBottomNavSizing, { once: true });
  } else {
    installMobileBottomNavSizing();
  }
}

export const initMobileStatusBar = async (isDark = true, _color = '#090C13') => {
  if (!isCapacitorNative()) return;
  try {
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch (err) {
    console.warn('[Capacitor] StatusBar configuration warning:', err);
  }
};

export const hideMobileSplashScreen = async () => {
  if (!isCapacitorNative()) return;
  try {
    await SplashScreen.hide();
  } catch (err) {
    console.warn('[Capacitor] SplashScreen hide warning:', err);
  }
};

const vibrateFallback = (pattern: number | number[]) => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {}
};

export const triggerHaptic = {
  light: async () => {
    if (!isCapacitorNative()) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      vibrateFallback(25);
    }
  },
  medium: async () => {
    if (!isCapacitorNative()) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {
      vibrateFallback(45);
    }
  },
  heavy: async () => {
    if (!isCapacitorNative()) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch {
      vibrateFallback(70);
    }
  },
  success: async () => {
    if (!isCapacitorNative()) return;
    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch {
      vibrateFallback([45, 35, 70]);
    }
  },
  warning: async () => {
    if (!isCapacitorNative()) return;
    try {
      await Haptics.notification({ type: NotificationType.Warning });
    } catch {
      vibrateFallback([35, 35, 35]);
    }
  },
  error: async () => {
    if (!isCapacitorNative()) return;
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {
      vibrateFallback([70, 40, 70]);
    }
  },
  selection: async () => {
    if (!isCapacitorNative()) return;
    try {
      await Haptics.selectionStart();
      await Haptics.selectionChanged();
      await Haptics.selectionEnd();
    } catch {
      vibrateFallback(18);
    }
  },
};

type MobileNavIndex = 0 | 1 | 2 | 3 | 4;
let mobileNavHistory: MobileNavIndex[] = [0];
let navigationTrackerInstalled = false;
let applyingBackNavigation = false;
let exitWarningUntil = 0;

const getVisibleBottomNavButtons = (): HTMLButtonElement[] => {
  if (typeof document === 'undefined') return [];
  const navs = Array.from(document.querySelectorAll('nav')) as HTMLElement[];
  const visibleNav = navs.find((nav) => {
    const rect = nav.getBoundingClientRect();
    const style = window.getComputedStyle(nav);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && nav.querySelectorAll('button').length === 5;
  });
  return visibleNav ? (Array.from(visibleNav.querySelectorAll('button')) as HTMLButtonElement[]) : [];
};

const getActiveBottomNavIndex = (): MobileNavIndex | null => {
  const buttons = getVisibleBottomNavButtons();
  if (buttons.length !== 5) return null;
  const activeIndex = buttons.findIndex((button) => String(button.className || '').includes('text-[#4ADE80]'));
  return activeIndex >= 0 ? (activeIndex as MobileNavIndex) : null;
};

const installNavigationTracker = () => {
  if (navigationTrackerInstalled || typeof document === 'undefined') return;
  navigationTrackerInstalled = true;
  document.addEventListener('click', (event) => {
    if (applyingBackNavigation) return;
    const target = event.target as HTMLElement | null;
    const button = target?.closest('nav button') as HTMLButtonElement | null;
    if (!button) return;
    setTimeout(() => {
      const activeIndex = getActiveBottomNavIndex();
      if (activeIndex === null) return;
      const last = mobileNavHistory[mobileNavHistory.length - 1];
      if (last !== activeIndex) mobileNavHistory.push(activeIndex);
    }, 0);
  }, true);
};

const navigateToPreviousPrimaryTab = (): boolean => {
  const buttons = getVisibleBottomNavButtons();
  const activeIndex = getActiveBottomNavIndex();
  if (buttons.length !== 5 || activeIndex === null || mobileNavHistory.length <= 1) return false;
  mobileNavHistory.pop();
  const previousButton = buttons[mobileNavHistory[mobileNavHistory.length - 1]];
  if (!previousButton) return false;
  applyingBackNavigation = true;
  previousButton.click();
  setTimeout(() => { applyingBackNavigation = false; }, 50);
  return true;
};

const findVisibleExplicitBackButton = (): HTMLButtonElement | null => {
  if (typeof document === 'undefined') return null;
  const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
  return buttons.find((button) => {
    const rect = button.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const title = (button.getAttribute('title') || '').toLowerCase();
    const aria = (button.getAttribute('aria-label') || '').toLowerCase();
    return title.includes('go back') || title.includes('back to') || aria.includes('go back') || aria === 'back';
  }) || null;
};

const hasVisibleModal = (): boolean => {
  if (typeof document === 'undefined') return false;
  const candidates = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')) as HTMLElement[];
  return candidates.some((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  });
};

const showExitWarning = () => {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('tokencare-exit-warning');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'tokencare-exit-warning';
  toast.textContent = 'Swipe back again to close TokenCare';
  Object.assign(toast.style, {
    position: 'fixed', left: '50%', bottom: '92px', transform: 'translateX(-50%)', zIndex: '2147483647',
    padding: '12px 18px', borderRadius: '999px', background: '#171A22', color: '#F4F4F5',
    border: '1px solid rgba(74, 222, 128, 0.35)', boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
    fontFamily: 'sans-serif', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', pointerEvents: 'none',
  });
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2200);
};

export const registerMobileBackButtonListener = (onBack: () => boolean | void) => {
  if (!isCapacitorNative()) return () => {};
  installNavigationTracker();
  const listenerPromise = CapApp.addListener('backButton', () => {
    if (hasVisibleModal()) {
      const handledByApp = onBack();
      if (handledByApp) return;
    }
    const explicitBackButton = findVisibleExplicitBackButton();
    if (explicitBackButton) {
      explicitBackButton.click();
      triggerHaptic.selection();
      return;
    }
    if (navigateToPreviousPrimaryTab()) {
      triggerHaptic.selection();
      return;
    }
    const handledByApp = onBack();
    if (handledByApp) return;
    const now = Date.now();
    if (now < exitWarningUntil) {
      exitWarningUntil = 0;
      return;
    }
    exitWarningUntil = now + 2200;
    showExitWarning();
    triggerHaptic.light();
  });
  return () => {
    listenerPromise.then((handle) => handle.remove()).catch(() => {});
  };
};
