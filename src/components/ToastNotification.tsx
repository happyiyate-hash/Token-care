import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Database, X, Info } from 'lucide-react';
import { triggerHaptic } from '../utils/capacitor';
import { safeOverrideFetch } from '../utils/safeFetchOverride';
import { ToastPayload } from '../services/toastManager';

export interface ToastProps {
  message: string | null;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  onAction?: () => void;
  actionText?: string;
  duration?: number;
}

type BackgroundTokenEvent = {
  name?: string;
  symbol?: string;
  chain?: string;
};

const isDonatePageActive = (): boolean => {
  if (typeof document === 'undefined') return false;
  const navButtons = Array.from(document.querySelectorAll('nav button')) as HTMLButtonElement[];
  const donateButton = navButtons.find((button) => /donate/i.test(button.textContent || ''));
  if (donateButton) {
    const className = String(donateButton.className || '');
    if (className.includes('text-[#4ADE80]')) return true;
    if (window.getComputedStyle(donateButton).color === 'rgb(74, 222, 128)') return true;
  }
  const text = document.body?.innerText || '';
  return text.includes('EVM Token Verification Panel') && text.includes('Fetch & Verify');
};

const isVerificationCompletionMessage = (message: string | null): boolean => {
  if (!message) return false;
  const normalized = message.toLowerCase();
  if (normalized.includes('saved')) return false;
  return (
    normalized.includes('verification successful') ||
    normalized.includes('verification complete') ||
    normalized.includes('successfully verified') ||
    normalized.includes('token fetched') ||
    normalized.includes('fetch successful') ||
    normalized.includes('fetch complete') ||
    normalized.includes('successfully fetched')
  );
};

const installBackgroundFetchBridge = (): (() => void) => {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return () => {};
  const win = window as typeof window & {
    __tokencareBackgroundFetchBridgeInstalled?: boolean;
  };
  if (win.__tokencareBackgroundFetchBridgeInstalled) return () => {};
  win.__tokencareBackgroundFetchBridgeInstalled = true;

  const restore = safeOverrideFetch((originalFetch) => {
    return async (...args) => {
      const response = await originalFetch(...args);
      try {
        const requestInput = args[0];
        const url = typeof requestInput === 'string'
          ? requestInput
          : requestInput instanceof Request
            ? requestInput.url
            : String((requestInput as any)?.url || '');

        if (url.includes('api.dexscreener.com/latest/dex/tokens/') && response.ok) {
          response.clone().json().then((data: any) => {
            const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
            if (!pairs.length) return;
            const bestPair = [...pairs].sort(
              (a: any, b: any) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0)
            )[0];
            const token = bestPair?.baseToken;
            if (!token?.name && !token?.symbol) return;

            window.dispatchEvent(new CustomEvent<BackgroundTokenEvent>('tokencare:token-fetch-success', {
              detail: {
                name: token?.name || '',
                symbol: token?.symbol || '',
                chain: bestPair?.chainId || '',
              },
            }));
          }).catch(() => {});
        }
      } catch {}
      return response;
    };
  });

  return () => {
    if (restore) restore();
    delete win.__tokencareBackgroundFetchBridgeInstalled;
  };
};

const BACKGROUND_VERIFICATION_SETTLE_MS = 3600;
const BACKGROUND_POLL_MS = 250;

export const ToastNotification: React.FC<ToastProps> = ({
  message: propMessage,
  type: propType = 'success',
  onClose: propOnClose,
  onAction,
  actionText,
  duration = 6000,
}) => {
  const [backgroundToken, setBackgroundToken] = useState<BackgroundTokenEvent | null>(null);
  const [eventToast, setEventToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const pendingBackgroundTokenRef = useRef<BackgroundTokenEvent | null>(null);
  const pendingKeyRef = useRef<string | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  // Global event listener for custom toast dispatches from services / backend
  useEffect(() => {
    const handleCustomToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastPayload>).detail;
      if (!detail || !detail.message) return;

      setEventToast({
        message: detail.message,
        type: detail.type || 'info',
      });

      if (detail.type === 'error') {
        void triggerHaptic.warning();
      } else if (detail.type === 'success') {
        void triggerHaptic.success();
      }
    };

    window.addEventListener('tokencare:toast', handleCustomToast);
    return () => {
      window.removeEventListener('tokencare:toast', handleCustomToast);
    };
  }, []);

  // Background fetch bridge setup
  useEffect(() => {
    const cleanupBridge = installBackgroundFetchBridge();

    const clearPendingTimers = () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const presentWhenUserIsAway = () => {
      const pending = pendingBackgroundTokenRef.current;
      if (!pending) return;

      if (isDonatePageActive()) {
        pollTimerRef.current = window.setTimeout(presentWhenUserIsAway, BACKGROUND_POLL_MS);
        return;
      }

      pendingBackgroundTokenRef.current = null;
      pendingKeyRef.current = null;
      setBackgroundToken(pending);
    };

    const handleBackgroundFetch = (event: Event) => {
      const detail = (event as CustomEvent<BackgroundTokenEvent>).detail;
      if (!detail) return;

      const key = `${detail.chain || ''}:${detail.symbol || detail.name || ''}`.toLowerCase();
      if (pendingKeyRef.current === key || backgroundToken) return;

      pendingKeyRef.current = key;
      pendingBackgroundTokenRef.current = detail;
      clearPendingTimers();

      completionTimerRef.current = window.setTimeout(() => {
        completionTimerRef.current = null;
        presentWhenUserIsAway();
      }, BACKGROUND_VERIFICATION_SETTLE_MS);
    };

    window.addEventListener('tokencare:token-fetch-success', handleBackgroundFetch);
    return () => {
      window.removeEventListener('tokencare:token-fetch-success', handleBackgroundFetch);
      clearPendingTimers();
      pendingBackgroundTokenRef.current = null;
      pendingKeyRef.current = null;
      cleanupBridge();
    };
  }, [backgroundToken]);

  // Handle active message from props
  useEffect(() => {
    if (!propMessage) return;

    if (isDonatePageActive() && isVerificationCompletionMessage(propMessage)) {
      propOnClose();
      return;
    }

    if (propType === 'success' && /successfully saved/i.test(propMessage)) {
      void triggerHaptic.success();
    } else if (propType === 'error') {
      void triggerHaptic.warning();
    }

    const timer = setTimeout(propOnClose, duration);
    return () => clearTimeout(timer);
  }, [propMessage, propType, duration, propOnClose]);

  // Handle active message from custom event
  useEffect(() => {
    if (!eventToast) return;
    const timer = setTimeout(() => setEventToast(null), duration);
    return () => clearTimeout(timer);
  }, [eventToast, duration]);

  // Handle background token notification
  useEffect(() => {
    if (!backgroundToken) return;
    const timer = setTimeout(() => setBackgroundToken(null), duration);
    return () => clearTimeout(timer);
  }, [backgroundToken, duration]);

  const activeMessage =
    eventToast?.message ||
    (backgroundToken
      ? `Token ready · ${backgroundToken.symbol || backgroundToken.name || 'token'}${backgroundToken.chain ? ` · ${backgroundToken.chain}` : ''}`
      : propMessage);

  const activeType: 'success' | 'error' | 'info' =
    eventToast?.type || (backgroundToken ? 'success' : propType);

  if (!activeMessage) return null;

  const dismiss = () => {
    setDragX(0);
    setDragging(false);
    if (eventToast) setEventToast(null);
    if (backgroundToken) setBackgroundToken(null);
    if (propMessage) propOnClose();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    startXRef.current = event.clientX;
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    setDragX(event.clientX - startXRef.current);
  };

  const handlePointerUp = () => {
    if (startXRef.current === null) return;
    const distance = dragX;
    startXRef.current = null;
    if (Math.abs(distance) >= 70) {
      dismiss();
      return;
    }
    setDragX(0);
    setDragging(false);
  };

  const isError = activeType === 'error';
  const isSuccess = activeType === 'success' || Boolean(backgroundToken);

  return (
    <>
      <style>{`
        @keyframes tokencare-toast-enter {
          0% { opacity: 0; transform: translate3d(0,-10px,0); }
          100% { opacity: 1; transform: translate3d(0,0,0); }
        }
        @keyframes tokencare-toast-sheen {
          0% { transform: translate3d(-160%,0,0) rotate(14deg); opacity: 0; }
          18% { opacity: .22; }
          62% { opacity: .08; }
          100% { transform: translate3d(360%,0,0) rotate(14deg); opacity: 0; }
        }
      `}</style>
      <div
        className="fixed inset-x-0 z-[2147483647] flex justify-center px-2.5 pointer-events-none"
        style={{ top: 'max(8px, calc(var(--safe-top, 0px) + 7px))' }}
      >
        <div
          role="status"
          aria-live="polite"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`pointer-events-auto relative w-full max-w-[480px] select-none touch-pan-y overflow-hidden rounded-[13px] border px-3.5 py-2.5 text-white shadow-[0_10px_32px_rgba(0,0,0,0.55)] backdrop-blur-xl will-change-transform ${
            isError
              ? 'border-rose-500/40 bg-gradient-to-r from-[#17080B] via-[#200B10] to-[#140608] shadow-[0_8px_28px_rgba(244,63,94,0.18)]'
              : isSuccess
              ? 'border-emerald-400/25 bg-gradient-to-r from-[#070B0A] via-[#0B1510] to-[#07100B]'
              : 'border-sky-500/25 bg-gradient-to-r from-[#070D14] via-[#0B1420] to-[#070C12]'
          }`}
          style={{
            transform: `translate3d(${dragX}px,0,0)`,
            opacity: Math.max(0.35, 1 - Math.min(Math.abs(dragX) / 260, 0.65)),
            transition: dragging ? 'none' : 'transform 180ms ease-out, opacity 180ms ease-out',
            animation: dragging ? 'none' : 'tokencare-toast-enter 180ms ease-out both',
          }}
        >
          {/* Subtle glow background */}
          <div
            className={`pointer-events-none absolute inset-0 ${
              isError
                ? 'bg-[radial-gradient(circle_at_20%_0%,rgba(244,63,94,0.15),transparent_50%)]'
                : 'bg-[radial-gradient(circle_at_20%_0%,rgba(34,197,94,0.12),transparent_50%)]'
            }`}
          />
          <div
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 bg-white/[0.04] blur-lg"
            style={{ animation: 'tokencare-toast-sheen 2.4s ease-out 1' }}
          />

          <div className="relative flex min-h-[38px] items-center gap-3">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border ${
                isError
                  ? 'border-rose-400/30 bg-rose-500/15'
                  : isSuccess
                  ? 'border-emerald-400/25 bg-emerald-500/15'
                  : 'border-sky-400/25 bg-sky-500/15'
              }`}
            >
              {backgroundToken ? (
                <Database className="h-3.5 w-3.5 text-emerald-300" />
              ) : isError ? (
                <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
              ) : isSuccess ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
              ) : (
                <Info className="h-3.5 w-3.5 text-sky-300" />
              )}
            </div>

            <div className="min-w-0 flex-1 leading-snug">
              <p
                className={`text-[8.5px] font-extrabold uppercase tracking-[0.16em] ${
                  isError
                    ? 'text-rose-400'
                    : isSuccess
                    ? 'text-emerald-400'
                    : 'text-sky-400'
                }`}
              >
                {backgroundToken
                  ? 'Token verification'
                  : isError
                  ? 'Backend Notice'
                  : isSuccess
                  ? 'Success'
                  : 'Notice'}
              </p>
              <p className="text-[11.5px] font-semibold text-zinc-100 break-words leading-tight mt-0.5">
                {activeMessage}
              </p>
            </div>

            <button
              type="button"
              onClick={dismiss}
              className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
