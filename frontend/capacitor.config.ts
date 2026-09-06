import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.heroicspiritgames.statusmanager',
  appName: 'Status Manager',
  webDir: 'dist',

  server: {
    /**
     * The app's own origin, and the reason it is 'http' rather than the
     * default 'https'.
     *
     * Capacitor serves the bundle from a local scheme handler, so the page
     * origin is `<androidScheme>://localhost`. With the default the origin is
     * https, and a request to a LAN backend on plain http is then MIXED
     * CONTENT - Chromium blocks it inside the WebView before it reaches the
     * network stack, where no cleartext permission can rescue it. On http
     * there is no mismatch, an https backend still works (an upgrade is never
     * blocked), and localhost counts as a secure context either way, so
     * nothing is given up.
     *
     * Do not change this later: localStorage is keyed by origin, so flipping
     * the scheme signs every installed user out and loses their saved server
     * address. It also has to stay in step with backend/src/http/cors.ts.
     */
    androidScheme: 'http',
  },

  android: {
    // Debug builds enable this anyway; stated explicitly so chrome://inspect
    // is guaranteed to work, which is the only real way to debug a WebView.
    webContentsDebuggingEnabled: true,
  },
};

export default config;
