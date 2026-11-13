import { forgetLocalPin } from "@/lib/local-pin";

/**
 * Signing out: forget what this phone kept for offline use (the remembered
 * PIN, quick add's choices and the saved pages). Entries still waiting to sync
 * stay, and go up after the next sign-in.
 */
export function forgetDevice() {
  forgetLocalPin();
  try {
    localStorage.removeItem("kp:qa-options");
    localStorage.removeItem("kp:lock-on");
    localStorage.removeItem("kp:pin-length");
    localStorage.removeItem("kp:passkey");
  } catch {
    /* storage blocked */
  }
  if ("caches" in window) {
    void caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("kp-pages")).map((k) => caches.delete(k))));
  }
}
