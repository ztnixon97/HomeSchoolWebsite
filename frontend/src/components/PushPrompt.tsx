import { useState, useEffect } from 'react';
import { useAuth } from '../auth';
import { api } from '../api';

const DISMISSED_KEY = 'push-prompt-dismissed';
const SUBSCRIBED_KEY = 'push-subscribed';

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && (navigator as any).standalone === true);
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function PushPrompt() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    if (localStorage.getItem(SUBSCRIBED_KEY)) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission === 'denied') return;
    if (Notification.permission === 'granted' && localStorage.getItem(SUBSCRIBED_KEY)) return;

    // On iOS, push only works in installed PWA
    if (isIOS() && !isStandalone()) return;

    api.get<{ public_key: string | null }>('/api/push/vapid-key').then(r => {
      if (r.public_key) {
        setVapidKey(r.public_key);
        setVisible(true);
      }
    }).catch(() => {});
  }, [user]);

  if (!visible) return null;

  const handleEnable = async () => {
    setRequesting(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setVisible(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey!,
      });

      const json = sub.toJSON();
      await api.post('/api/push/subscribe', {
        endpoint: json.endpoint,
        p256dh: json.keys!.p256dh,
        auth: json.keys!.auth,
      });

      localStorage.setItem(SUBSCRIBED_KEY, '1');
      setVisible(false);
    } catch (err) {
      console.error('Push subscription failed:', err);
    } finally {
      setRequesting(false);
    }
  };

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
          <div className="w-10 h-10 bg-cobalt/10 rounded-xl flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-cobalt" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">Enable Notifications</h3>
            <p className="text-xs text-gray-500 mt-0.5 mb-3">
              Get notified about RSVPs, session reminders, messages, and announcements.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleEnable}
                disabled={requesting}
                className="text-xs bg-cobalt text-white px-4 py-2 rounded-lg font-medium hover:bg-cobalt-dark disabled:opacity-50"
              >
                {requesting ? 'Enabling...' : 'Enable'}
              </button>
              <button
                onClick={dismiss}
                className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
