import { Platform } from 'react-native';

/**
 * Local Legends API configuration (multi-sport backend).
 *
 * In dev (__DEV__) the app talks to the local backend in ../../backend on :4000.
 *   - Android emulator reaches the host machine via 10.0.2.2
 *   - iOS simulator reaches it via localhost
 * In production it uses the deployed API.
 *
 * REAL DEVICES: 'localhost' / '10.0.2.2' won't work — set LOCAL_URL to your
 * computer's LAN IP, e.g. 'http://192.168.1.15:4000' (Option-click the Wi-Fi
 * icon on Mac to find it), or run the app with a release build pointed at PROD_URL.
 */

const API_PORT = 4000;

// Local Legends backend (dev)
const LOCAL_URL = Platform.select({
  android: `http://10.0.2.2:${API_PORT}`,   // Android emulator → host loopback
  ios: `http://localhost:${API_PORT}`,
  default: `http://localhost:${API_PORT}`,
});

// Deployed Local Legends API (Vercel project "allin1-api", Neon Postgres) — live.
const PROD_URL = 'https://allin1-api.vercel.app';

// Use the hosted backend by default (it's live). Flip to true to develop against
// the local server in ../../backend (npm run dev on :4000).
const USE_LOCAL_BACKEND = false;

const apiConfig = {
  API_PORT,
  LOCAL_URL,
  PROD_URL,
  // Active base URL. Override at runtime via global.API_BASE_URL if needed.
  BASE_URL: USE_LOCAL_BACKEND ? LOCAL_URL : PROD_URL,
};

export default apiConfig;
