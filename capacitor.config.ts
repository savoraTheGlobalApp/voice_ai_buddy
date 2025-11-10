import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voiceaibuddy.app',
  appName: 'Voice AI Buddy',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    allowNavigation: ['*'],
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
  },
};

export default config;
