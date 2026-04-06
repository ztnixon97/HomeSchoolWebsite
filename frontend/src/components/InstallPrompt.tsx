import { useState, useEffect } from 'react';

type Platform = 'ios-safari' | 'ios-other' | 'android' | null;

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  if (isIOS) {
    // Safari doesn't include "CriOS", "FxiOS", etc.
    const isSafari = !/(CriOS|FxiOS|OPiOS|EdgiOS)/.test(ua);
    return isSafari ? 'ios-safari' : 'ios-other';
  }
  if (isAndroid) return 'android';
  return null;
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && (navigator as any).standalone === true);
}

const DISMISSED_KEY = 'pwa-install-dismissed';

export default function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;
    if (isStandalone()) return;
    const p = detectPlatform();
    if (p) {
      setPlatform(p);
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 pb-[env(safe-area-inset-bottom,16px)]">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 p-4 relative">
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 p-1"
          aria-label="Dismiss"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-start gap-3 pr-6">
          <img src="/pwa-192.png" alt="WLPC" className="w-12 h-12 rounded-xl shrink-0" />
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">Install WLPC</h3>
            <p className="text-xs text-gray-500 mt-0.5 mb-2">
              Add to your home screen for quick access.
            </p>

            {platform === 'ios-safari' && (
              <div className="text-xs text-gray-700 space-y-1.5">
                <p className="flex items-center gap-1.5">
                  <span className="font-medium">1.</span> Tap the share button
                  <svg className="w-4 h-4 text-cobalt shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15" />
                  </svg>
                </p>
                <p><span className="font-medium">2.</span> Scroll down and tap <strong>Add to Home Screen</strong></p>
                <p><span className="font-medium">3.</span> Tap <strong>Add</strong></p>
              </div>
            )}

            {platform === 'ios-other' && (
              <div className="text-xs text-gray-700 space-y-1.5">
                <p>To install, open this page in <strong>Safari</strong>, then:</p>
                <p className="flex items-center gap-1.5">
                  <span className="font-medium">1.</span> Tap the share button
                  <svg className="w-4 h-4 text-cobalt shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15" />
                  </svg>
                </p>
                <p><span className="font-medium">2.</span> Tap <strong>Add to Home Screen</strong></p>
              </div>
            )}

            {platform === 'android' && (
              <div className="text-xs text-gray-700 space-y-1.5">
                <p className="flex items-center gap-1.5">
                  <span className="font-medium">1.</span> Tap the menu
                  <svg className="w-4 h-4 text-cobalt shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </p>
                <p><span className="font-medium">2.</span> Tap <strong>Add to Home screen</strong> or <strong>Install app</strong></p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
