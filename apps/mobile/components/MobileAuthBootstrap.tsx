"use client";

import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { useEffect } from "react";

export function MobileAuthBootstrap() {
  useEffect(() => {
    let disposed = false;
    let listenerHandle: PluginListenerHandle | undefined;

    void (async () => {
      const handleUrl = async (url: string) => {
        // Keep native-only auth initialization out of static prerendering.
        const { handleAuthCallbackUrl } = await import("../lib/auth/oauth");
        await handleAuthCallbackUrl(url);
      };

      // Register the warm-start listener before awaiting the cold-start URL.
      const listener = await App.addListener("appUrlOpen", (event) => {
        void handleUrl(event.url).catch((error) => {
          console.error("OAuth callback handling failed:", error);
        });
      });

      if (disposed) {
        await listener.remove();
        return;
      }
      listenerHandle = listener;

      // A URL delivered through both paths is deduplicated by the callback handler.
      const launchResult = await App.getLaunchUrl();
      if (launchResult?.url) {
        await handleUrl(launchResult.url);
      }
    })().catch((error) => {
      console.error("Mobile auth bootstrap failed:", error);
    });

    return () => {
      disposed = true;
      void listenerHandle?.remove();
    };
  }, []);

  return null;
}
