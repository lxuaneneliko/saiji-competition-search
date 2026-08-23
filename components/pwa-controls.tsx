"use client";

import { Check, Download, Share2, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaControls() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [online, setOnline] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const hydrate = window.setTimeout(() => {
      setInstalled(isStandalone());
      setOnline(navigator.onLine);
    }, 0);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then((registration) => registration.update())
        .catch(() => undefined);
    }

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowHelp(false);
    };
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.clearTimeout(hydrate);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) {
      setShowHelp((current) => !current);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  };

  return (
    <>
      <div className="pwa-controls">
        {installed ? (
          <span className="installed-chip"><Check size={14} />App 已安裝</span>
        ) : (
          <button className="install-button" type="button" onClick={handleInstall} aria-expanded={showHelp}>
            <Download size={16} />安裝 App
          </button>
        )}
        {showHelp && !installed && (
          <div className="install-help" role="status">
            <button type="button" onClick={() => setShowHelp(false)} aria-label="關閉安裝說明"><X size={15} /></button>
            <span><Share2 size={17} /></span>
            <div><strong>把賽跡放進主畫面</strong><p>iPhone／iPad：點瀏覽器的分享按鈕，再選「加入主畫面」。電腦或 Android：使用網址列的安裝圖示。</p></div>
          </div>
        )}
      </div>
      {!online && <div className="offline-status" role="status"><WifiOff size={15} /><span>目前離線｜可查看已載入介面與本機收藏，搜尋需恢復網路。</span></div>}
    </>
  );
}
