'use client';
import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Registers the service worker in production builds only, so local development never serves a cached asset. */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* the site works without it */ });
  }, []);
  return null;
}

/**
 * "Install app". Browsers that support an install prompt (Chrome, Edge, Samsung Internet on Android and
 * desktop) get a button; iPhone and iPad Safari have no prompt, so they get the one instruction that works
 * there. Nothing is shown once the app is already running installed.
 */
export function InstallApp() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone);
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    const onDone = () => { setInstalled(true); setEvt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onDone);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onDone); };
  }, []);
  if (installed) return null;
  if (evt) return <p className="install"><button type="button" onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); }}>Install DrukView as an app</button></p>;
  if (ios) return <p className="install note">To use DrukView as an app on this iPhone or iPad, tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>;
  return null;
}
