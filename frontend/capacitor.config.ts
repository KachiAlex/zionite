import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fm.zionite.app',
  appName: 'ZioniteFM',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    url: 'https://zionite.online',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0c0c12',
      showSpinner: false,
      androidSplashResourceName: 'splash',
    },
  },
};

export default config;
