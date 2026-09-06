import { Capacitor } from "@capacitor/core";

/**
 * True only inside the Android WebView, false in every browser.
 *
 * Every native branch in the app goes through this one function rather than
 * testing user agents or feature-sniffing at the call site, so the answer is
 * consistent and there is a single place to look when behaviour differs between
 * the web deployment and the app.
 *
 * Safe to call in the web bundle: @capacitor/core ships a stub that reports the
 * platform as "web", so nothing here depends on the native runtime existing.
 */
export const isNative = () => Capacitor.isNativePlatform();
