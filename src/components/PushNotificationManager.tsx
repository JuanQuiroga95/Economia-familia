'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

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
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      registerServiceWorker();
    }
  }, []);

  async function registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      const sub = await registration.pushManager.getSubscription();
      setSubscription(sub);
      
      // If we are already logged in and have a subscription, maybe refresh it on backend
      if (sub && status === 'authenticated') {
         sendSubscriptionToBackEnd(sub);
      }
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }

  async function subscribeToPush() {
    setIsLoading(true);
    try {
      // Request permission
      let permission = Notification.permission;
      if (permission !== 'granted') {
         permission = await Notification.requestPermission();
      }
      
      if (permission !== 'granted') {
        setIsHidden(true);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const response = await fetch('/api/push/vapidPublicKey');
      const vapidPublicKey = await response.text();
      
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      
      setSubscription(sub);
      await sendSubscriptionToBackEnd(sub);
      
    } catch (error) {
      console.error('Failed to subscribe to push notifications', error);
      alert('Error al activar notificaciones. Puede que el navegador no lo soporte o esté bloqueado.');
    } finally {
      setIsLoading(false);
    }
  }

  async function sendSubscriptionToBackEnd(subscription: PushSubscription) {
    try {
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription),
      });
    } catch (error) {
      console.error('Failed to send subscription to backend', error);
    }
  }

  useEffect(() => {
     if (status === 'authenticated' && subscription) {
       sendSubscriptionToBackEnd(subscription);
     }
  }, [status, subscription]);
  
  if (!isSupported || subscription || isHidden) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] p-4 bg-bg-secondary rounded-lg border border-border-primary shadow-lg flex items-center justify-between gap-4 max-w-sm">
      <div className="text-sm">
        <p className="font-semibold text-text-primary mb-1">Activar notificaciones</p>
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
        <button onClick={() => setIsHidden(true)} className="p-1 text-text-secondary hover:text-text-primary transition rounded-full hover:bg-bg-tertiary">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    </div>
  );
}
