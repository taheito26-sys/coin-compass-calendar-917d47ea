/**
 * Mobile install gate policy.
 *
 * Mobile browsers (iOS/Android) are blocked from using the app until it is
 * installed and reopened as a standalone PWA from the home screen. Desktop
 * browsers are never gated — they get the dismissible InstallPrompt banner
 * instead.
 *
 * Can be switched off at build time with `VITE_FORCE_MOBILE_INSTALL=false`.
 */

export type DeviceKind = "ios" | "android" | "desktop";

export type GateStage = "install" | "awaiting-launch";

export interface InstallGateInput {
  deviceKind: DeviceKind;
  isStandalone: boolean;
  /** An `appinstalled` event fired during this session. */
  verifiedInstall: boolean;
  enforceMobile: boolean;
}

export interface InstallGateDecision {
  blocked: boolean;
  stage: GateStage;
}

const IN_APP_BROWSER_PATTERNS = [
  /FBAN|FBAV|FB_IAB/i, // Facebook
  /Instagram/i,
  /Messenger/i,
  /Line\//i,
  /Twitter/i,
  /WhatsApp/i,
  /Snapchat/i,
  /TikTok|BytedanceWebview/i,
  /GSA\//i, // Google app
  /; wv\)/i, // generic Android WebView
];

export function detectDeviceKind(userAgent: string): DeviceKind {
  if (/iphone|ipod/i.test(userAgent)) return "ios";
  if (/ipad/i.test(userAgent)) return "ios";
  // iPadOS 13+ reports a desktop Safari UA; touch points disambiguate it.
  if (
    /macintosh/i.test(userAgent) &&
    typeof navigator !== "undefined" &&
    (navigator.maxTouchPoints ?? 0) > 1
  ) {
    return "ios";
  }
  if (/android/i.test(userAgent)) return "android";
  return "desktop";
}

export function isMobileDevice(deviceKind: DeviceKind): boolean {
  return deviceKind === "ios" || deviceKind === "android";
}

/** Embedded browsers (Facebook, Instagram, Android WebView, …) can't install a PWA. */
export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_BROWSER_PATTERNS.some((pattern) => pattern.test(userAgent));
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isMobileInstallEnforced(): boolean {
  const raw = import.meta.env?.VITE_FORCE_MOBILE_INSTALL;
  if (raw === undefined || raw === null || raw === "") return true;
  const value = String(raw).toLowerCase();
  return value !== "false" && value !== "0" && value !== "off";
}

export function evaluateInstallGate(input: InstallGateInput): InstallGateDecision {
  const { deviceKind, isStandalone, verifiedInstall, enforceMobile } = input;

  if (isStandalone) {
    return { blocked: false, stage: "install" };
  }

  const mobile = isMobileDevice(deviceKind);
  if (mobile && enforceMobile) {
    return { blocked: true, stage: verifiedInstall ? "awaiting-launch" : "install" };
  }

  return { blocked: false, stage: "install" };
}
