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
    try {
      const registration = await navigator.serviceWorker.ready;
      const response = await fetch('/api/push/vapidPublicKey');
      const vapidPublicKey = await response.text();
      
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      
      setSubscription(sub);
      await sendSubscriptionToBackEnd(sub);
      
      // Request permission
      if (Notification.permission !== 'granted') {
         await Notification.requestPermission();
      }
    } catch (error) {
      console.error('Failed to subscribe to push notifications', error);
    }
  }

  async function sendSubscriptionToBackEnd(subscription: PushSubscription) {
    try {
      // In a real app we might want to get the specific profileId the user is logged into.
      // For now we'll send it and the backend will attach to the first profile.
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

  // Effect to handle late login (they were unauthenticated when component mounted, now authenticated)
  useEffect(() => {
     if (status === 'authenticated' && subscription) {
       sendSubscriptionToBackEnd(subscription);
     }
  }, [status, subscription]);
  
  // We can render a button to prompt the user if they are not subscribed
  // For a seamless experience, we might prompt them subtly.
  // In this case, we will just render a small invisible component, or a button if needed.
  if (!isSupported || subscription) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 p-4 bg-bg-secondary rounded-lg border border-border-primary shadow-lg flex items-center justify-between gap-4 max-w-sm">
      <div className="text-sm">
        <p className="font-semibold text-text-primary mb-1">Activar notificaciones</p>
        <p className="text-text-secondary text-xs">Recibí alertas cuando se registren nuevos gastos o ingresos.</p>
      </div>
      <button 
        onClick={subscribeToPush}
        className="px-3 py-1.5 bg-primary text-white rounded-md text-sm font-medium hover:bg-opacity-90 transition"
      >
        Activar
      </button>
    </div>
  );
}
