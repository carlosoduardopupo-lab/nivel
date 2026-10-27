// Conexión para los scripts de administrador.
// Por defecto usan los emuladores. Con --nube usan el proyecto real con tu
// sesión de gcloud (`gcloud auth application-default login`), o con
// GOOGLE_APPLICATION_CREDENTIALS si apunta a una cuenta de servicio.
import { initializeApp } from "firebase-admin/app";

export const enNube = process.argv.includes("--nube");
export const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
export const PROYECTO = enNube ? process.env.GCLOUD_PROJECT ?? "blurry-78f0d" : "demo-nivel";
export const BUCKET = enNube ? `${PROYECTO}.firebasestorage.app` : "demo-nivel.appspot.com";

if (enNube) {
  // Las llamadas se cobran al proyecto real, no al que tenga gcloud por defecto.
  process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROYECTO;
} else {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
  process.env.STORAGE_EMULATOR_HOST ??= "http://127.0.0.1:9199";
}

initializeApp({ projectId: PROYECTO, storageBucket: BUCKET });
