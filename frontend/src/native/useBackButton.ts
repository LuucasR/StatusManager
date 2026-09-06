import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { isNative } from "./platform";

/**
 * Makes Android's back button navigate instead of quitting.
 *
 * Capacitor's default is to close the app on every press, which reads as a
 * crash: tapping back from the task board drops you out of Status Manager
 * entirely rather than returning to the dashboard.
 *
 * `canGoBack` reflects the WebView's history, which react-router drives, so
 * back only exits once there is nowhere left to go.
 */
export function useBackButton() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNative()) return;

    // addListener is async, so the handle has to be awaited before it can be
    // removed; keeping the promise means a fast unmount cannot leak a listener.
    const pending = CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) navigate(-1);
      else void CapacitorApp.exitApp();
    });

    return () => {
      void pending.then((handle) => handle.remove());
    };
  }, [navigate]);
}
