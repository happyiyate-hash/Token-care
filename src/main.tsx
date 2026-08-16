import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { I18nProvider } from './context/I18nContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { installNativeClipboardBridge } from './services/nativeClipboardBridge';
import { installSupabaseDataCache } from './services/supabaseDataCache';
import { installVerificationLifecycle } from './services/backgroundVerification';

installNativeClipboardBridge();
installSupabaseDataCache();
installVerificationLifecycle();

// Register Service Worker for PWA Offline & Installation Support
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[TokenCare PWA] Service Worker registered with scope:', registration.scope);
      })
      .catch((error) => {
        console.error('[TokenCare PWA] Service Worker registration failed:', error);
      });
  });
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[TokenCare PWA] Dev Service Worker registered:', registration.scope);
      })
      .catch((err) => {
        console.warn('[TokenCare PWA] SW registration notice:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <CurrencyProvider>
        <App />
      </CurrencyProvider>
    </I18nProvider>
  </StrictMode>,
);
