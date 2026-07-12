'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useProfile } from '@/hooks/useProfile';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationManager() {
  const { status } = useSession();
  const { activeProfile } = useProfile();
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [registered, setRegistered] = useState(false);

  // Check support
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
      setIsSupported(true);
    }
  }, []);

  // Register SW and check existing subscription
  useEffect(() => {
    if (!isSupported) return;
    
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(async (registration) => {
        const existingSub = await registration.pushManager.getSubscription();
        if (existingSub) {
          setSubscription(existingSub);
        }
      })
      .catch((err) => console.error('[PushManager] SW registration failed:', err));
  }, [isSupported]);

  // Whenever we have a subscription + activeProfile + authenticated, sync with backend
  const syncSubscription = useCallback(async (sub: PushSubscription) => {
    if (!activeProfile?.id || registered) return;
    
    try {
      const subJson = sub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          expirationTime: subJson.expirationTime,
          keys: subJson.keys,
          profileId: activeProfile.id,
        }),
      });
      const data = await res.json();
      console.log('[PushManager] Subscription synced:', data);
      if (data.success) {
        setRegistered(true);
      }
    } catch (err) {
      console.error('[PushManager] Failed to sync subscription:', err);
    }
  }, [activeProfile?.id, registered]);

  useEffect(() => {
    if (status === 'authenticated' && subscription && activeProfile?.id) {
      syncSubscription(subscription);
    }
  }, [status, subscription, activeProfile?.id, syncSubscription]);

  // Re-sync when active profile changes
  useEffect(() => {
    setRegistered(false);
  }, [activeProfile?.id]);

  async function subscribeToPush() {
    setIsLoading(true);
    try {
      // Step 1: Request notification permission
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        alert('Permisos de notificación denegados. Revisá la configuración de tu navegador.');
        setIsHidden(true);
        return;
      }

      // Step 2: Get VAPID public key from server
      const keyRes = await fetch('/api/push/vapidPublicKey');
      if (!keyRes.ok) {
        throw new Error(`Failed to get VAPID key: ${keyRes.status}`);
      }
      const vapidPublicKey = await keyRes.text();

      // Step 3: Subscribe via PushManager
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      setSubscription(sub);

      // Step 4: Send to backend
      const subJson = sub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          expirationTime: subJson.expirationTime,
          keys: subJson.keys,
          profileId: activeProfile?.id,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setRegistered(true);
        alert(`✅ Notificaciones activadas para ${data.profileName || activeProfile?.name || 'tu perfil'}`);
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (error: any) {
      console.error('[PushManager] Subscribe error:', error);
      alert(`Error al activar notificaciones: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // Don't render if not supported, already subscribed, or user closed it
  if (!isSupported || subscription || isHidden || status !== 'authenticated') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] p-4 bg-bg-secondary rounded-lg border border-border-primary shadow-lg flex items-center justify-between gap-4 max-w-sm animate-slide-up">
      <div className="text-sm">
        <p className="font-semibold text-text-primary mb-1">🔔 Activar notificaciones</p>
        <p className="text-text-secondary text-xs">Recibí alertas cuando se registren nuevos gastos o ingresos.</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={subscribeToPush}
          disabled={isLoading}
          className="px-3 py-1.5 bg-primary text-white rounded-md text-sm font-medium hover:bg-opacity-90 transition disabled:opacity-50"
        >
          {isLoading ? 'Activando...' : 'Activar'}
        </button>
        <button
          onClick={() => setIsHidden(true)}
          className="p-1 text-text-secondary hover:text-text-primary transition rounded-full hover:bg-bg-tertiary"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
