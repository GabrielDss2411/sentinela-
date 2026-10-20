import type { CapacitorConfig } from '@capacitor/cli';

// Android app wrapper (see docs/DOCUMENTACAO.md "App Android"). The web build in dist/ is bundled
// into the APK and served from https://localhost, which the VPS API allows via CORS.
//
// Live reload while developing: CAP_SERVER_URL=http://10.0.2.2:5173 npx cap sync android
// makes the emulator load the Vite dev server instead (10.0.2.2 = the host machine).
// Never ship an APK built with it.
const devServer = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'br.app.sentinela',
  appName: 'Sentinela',
  webDir: 'dist',
  backgroundColor: '#060d17',
  android: {
    backgroundColor: '#060d17',
  },
  plugins: {
    // Light status/navigation bar icons over the dark navy UI.
    SystemBars: { style: 'DARK' },
  },
  ...(devServer && { server: { url: devServer, cleartext: true } }),
};

export default config;
