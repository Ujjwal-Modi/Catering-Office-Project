import {
  initializeApp,
  getAuth,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getStorage,
} from "./sdk.js";
import { firebaseConfig, PHOTOS_ENABLED } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Offline cache: staff on site with weak network can keep working;
// changes sync automatically when the connection returns.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// PHOTOS DISABLED: Storage is only initialised when photos are switched on.
export const storage = PHOTOS_ENABLED ? getStorage(app) : null;

export const isConfigured = !String(firebaseConfig.apiKey).startsWith("YOUR_");
