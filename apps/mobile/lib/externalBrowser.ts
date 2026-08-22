import { Browser } from "@capacitor/browser";
import type { ExternalBrowser } from "@kabehub/shared";

export const externalBrowser: ExternalBrowser = {
  async open(url) {
    await Browser.open({ url });
  },
};
