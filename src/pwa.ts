import { registerSW } from "virtual:pwa-register";

const BUILD_STORAGE_KEY = "__app_build_id__";
const BUILD_RELOAD_GUARD_KEY = "__app_build_reload_guard__";
const SW_RELOAD_GUARD_KEY = "__app_sw_reload_guard__";

/**
 * If the previously stored build id differs from the current one, the
 * installed PWA's caches/service worker are from an old build. Rather than
 * risk it running stale JS indefinitely, wipe everything and reload once.
 */
async function recoverFromBuildDrift(): Promise<boolean> {
  if (typeof window === "undefined") return true;

  const previousBuildId = localStorage.getItem(BUILD_STORAGE_KEY);
  const reloadGuard = sessionStorage.getItem(BUILD_RELOAD_GUARD_KEY);
  const buildId = __APP_BUILD_ID__;
  const hasDrift = previousBuildId && previousBuildId !== buildId;

  if (hasDrift && reloadGuard !== buildId) {
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }
    } catch {
      // Best-effort cache drift recovery.
    }

    sessionStorage.setItem(BUILD_RELOAD_GUARD_KEY, buildId);
    localStorage.setItem(BUILD_STORAGE_KEY, buildId);
    window.location.reload();
    return false;
  }

  localStorage.setItem(BUILD_STORAGE_KEY, buildId);
  sessionStorage.removeItem(BUILD_RELOAD_GUARD_KEY);
  return true;
}

/**
 * Force a reload when a new service worker takes control mid-session.
 *
 * Two safeguards keep this from turning into a reload loop (which looks to
 * the user like the app endlessly "loading"/"authenticating" and never
 * settling): the in-memory `reloaded` flag only prevents a second reload
 * from the *same* page instance, so if a reload triggers another
 * controllerchange (e.g. the SW keeps re-activating), the plain in-memory
 * guard does nothing - a fresh page load resets it. Back it with a
 * sessionStorage guard so at most one such reload happens per tab session.
 * Also skip the reload outright while an OAuth redirect callback (code or
 * token in the URL) is still being processed, so a mistimed SW swap can't
 * interrupt sign-in and strand the user on a blank/stuck screen.
 */
function reloadOnServiceWorkerSwap() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    if (sessionStorage.getItem(SW_RELOAD_GUARD_KEY)) return;
    const isOAuthCallback = /[?#].*(code=|access_token=)/.test(window.location.href);
    if (isOAuthCallback) return;
    reloaded = true;
    sessionStorage.setItem(SW_RELOAD_GUARD_KEY, "1");
    window.location.reload();
  });
}

/** Runs the build-drift check, then mounts the app if it's safe to. */
export async function initPwa(render: () => void) {
  const shouldRender = await recoverFromBuildDrift();
  if (!shouldRender) return;

  reloadOnServiceWorkerSwap();
  if (import.meta.env.PROD) {
    registerSW({ immediate: true });
  }

  render();
}
