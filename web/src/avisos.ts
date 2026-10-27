// Notificaciones push en este dispositivo (Firebase Cloud Messaging + el service worker /sw.js).
import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { api } from "./api";
import { app, usaEmuladores } from "./firebase";

export type EstadoPush = "no-soportado" | "bloqueado" | "pendiente" | "activado";

async function soportado(): Promise<boolean> {
  if (usaEmuladores || !("serviceWorker" in navigator) || !("Notification" in window)) return false;
  return isSupported().catch(() => false);
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!(await soportado())) return "no-soportado";
  if (Notification.permission === "denied") return "bloqueado";
  return Notification.permission === "granted" ? "activado" : "pendiente";
}

async function registrarToken(): Promise<void> {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { serviceWorkerRegistration: reg });
  if (token) await api.registrarDispositivo({ token });
}

/** Pide permiso (si hace falta) y registra este dispositivo. Debe llamarse tras un toque del usuario. */
export async function activarPush(): Promise<EstadoPush> {
  if (!(await soportado())) return "no-soportado";
  const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (p !== "granted") return p === "denied" ? "bloqueado" : "pendiente";
  await registrarToken();
  return "activado";
}

/** Al abrir la app con permiso ya concedido: renueva el token por si cambió. */
export async function renovarPush(): Promise<void> {
  if ((await estadoPush()) === "activado") await registrarToken().catch(() => {});
}

/** Deja de recibir push en este dispositivo (al cerrar sesión). */
export async function desactivarPush(): Promise<void> {
  if (!(await soportado()) || Notification.permission !== "granted") return;
  const m = getMessaging(app);
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const token = await getToken(m, reg ? { serviceWorkerRegistration: reg } : undefined).catch(() => null);
  if (token) await api.borrarDispositivo({ token }).catch(() => {});
  await deleteToken(m).catch(() => {});
}
