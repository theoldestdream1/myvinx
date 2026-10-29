import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Service worker: push notifications, share target, offline shell.
// Skipped in dev (it would cache stale modules) and inside editor preview iframes.
const inIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
const isPreviewHost = /(^|\.)lovableproject\.com$|^id-preview--/.test(window.location.hostname);

if ("serviceWorker" in navigator && import.meta.env.PROD && !inIframe && !isPreviewHost) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("SW registration failed", e));
  });
}
