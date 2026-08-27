import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kabehub.app",
  appName: "KabeHub",
  webDir: "out",
  loggingBehavior: "none",
  server: {
    hostname: "localhost",
    androidScheme: "https",
  },
};

export default config;
