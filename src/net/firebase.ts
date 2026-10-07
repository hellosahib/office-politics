// Lazy Firebase init so offline/local play never loads or needs a config.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, type Firestore } from 'firebase/firestore';

const env = import.meta.env;

export function isOnlineAvailable(): boolean {
  return !!(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_AUTH_DOMAIN && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
}

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let uid: Promise<string> | undefined;

function getApp(): FirebaseApp {
  if (!isOnlineAvailable()) throw new Error('Online play is not configured (VITE_FIREBASE_* missing).');
  return (app ??= initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
  }));
}

// ignoreUndefinedProperties: optional config fields (e.g. `rounds`) may be undefined.
export function getDb(): Firestore {
  if (db) return db;
  db = initializeFirestore(getApp(), { ignoreUndefinedProperties: true });
  // VITE_FIREBASE_EMULATOR=1 → local emulators (firebase emulators:start --only auth,firestore).
  if (env.VITE_FIREBASE_EMULATOR) connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return db;
}

/** Anonymous uid; persisted by the Auth SDK in IndexedDB so a refresh keeps the same seat. */
export function getUid(): Promise<string> {
  return (uid ??= (async () => {
    const auth = getAuth(getApp());
    if (env.VITE_FIREBASE_EMULATOR && !auth.emulatorConfig) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    await auth.authStateReady();
    return auth.currentUser?.uid ?? (await signInAnonymously(auth)).user.uid;
  })().catch((e) => { uid = undefined; throw e; }));
}
