import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.xxinovxx.quizapp',
  appName: '知题',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
    },
  },
}

export default config
