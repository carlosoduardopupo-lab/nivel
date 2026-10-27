import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

// En `npm run dev` siempre se usan los emuladores (proyecto demo, sin nube).
export const usaEmuladores = import.meta.env.DEV || import.meta.env.VITE_USAR_EMULADORES === "true";

const env = import.meta.env;

// En Firebase Hosting, la configuración del proyecto se sirve en /__/firebase/init.json,
// así no hace falta copiarla a mano. Si existe VITE_FIREBASE_API_KEY, se usa esa.
async function configNube() {
  if (env.VITE_FIREBASE_API_KEY) {
    return {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      appId: env.VITE_FIREBASE_APP_ID,
    };
  }
  const r = await fetch("/__/firebase/init.json");
  if (!r.ok) throw new Error("No se encontró la configuración de Firebase (/__/firebase/init.json).");
  return r.json();
}

const config = usaEmuladores
  ? {
      apiKey: "demo-key",
      authDomain: "demo-nivel.firebaseapp.com",
      projectId: "demo-nivel",
      storageBucket: "demo-nivel.appspot.com",
      appId: "demo-app",
    }
  : await configNube();

export const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

if (usaEmuladores) {
  const host = location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectStorageEmulator(storage, host, 9199);
  connectFunctionsEmulator(functions, host, 5001);
}
