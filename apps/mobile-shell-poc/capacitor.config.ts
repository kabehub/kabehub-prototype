import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kabehub.app',
  appName: 'KabeHub',
  webDir: 'www',
  server: {
    url: 'https://www.kabehub.com',
    cleartext: false
  }
};

export default config;
