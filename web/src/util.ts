import { getBlob, ref } from "firebase/storage";
import { storage } from "./firebase";

export const INTERESES = ["Viajes", "Comida", "Autos", "Fitness", "Música", "Moda", "Cine", "Deportes", "Tecnología", "Arte", "Mascotas", "Naturaleza", "Fotografía", "Videojuegos", "Baile"];
export const tiempoDe = (p: number) => Math.min(30, 10 + 5 * (p - 1));
export const nf = (n: number) => n.toLocaleString("es");
export const dinero = (milesimas: number) => "$" + (Math.floor(milesimas / 10) / 100).toFixed(2);
export const comisionRetiro = (milesimas: number) => 2000 + Math.round(milesimas * 0.0025) + 250;
export const monedasTxt = (n: number) => `${n} ${n === 1 ? "moneda" : "monedas"}`;

// Mismo "día del juego" que el servidor.
export const diaDe = (f: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(f);

export function fmtFalta(ms: number) {
  ms = Math.max(0, ms);
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4), s = Math.floor((ms % 6e4) / 1e3);
  return [h, m, s].map((x) => String(x).padStart(2, "0")).join(":");
}

export function dificultad(c: { porcentajeFallos?: number; porcentajeMeGusta?: number | null; totalDesbloqueos?: number }): [string, string, string] {
  const f = c.porcentajeFallos ?? 0;
  if ((c.totalDesbloqueos ?? 0) < 20) return ["Nuevo", "var(--surface2)", "var(--fg)"];
  if (f >= 65) return ["Muy difícil", "rgba(217,68,63,.14)", "var(--rojo)"];
  if (f >= 50) return ["Difícil", "rgba(239,159,39,.18)", "#B06A00"];
  if (f >= 35) return ["Media", "rgba(26,143,106,.14)", "var(--verde)"];
  return ["Fácil", "rgba(26,143,106,.14)", "var(--verde)"];
}

// Las imágenes se descargan con getBlob para que Storage aplique las reglas en cada lectura.
const cache = new Map<string, Promise<string>>();
export function urlDeRuta(ruta: string): Promise<string> {
  let p = cache.get(ruta);
  if (!p) {
    p = getBlob(ref(storage, ruta)).then((b) => URL.createObjectURL(b));
    p.catch(() => cache.delete(ruta));
    cache.set(ruta, p);
  }
  return p;
}

/** Reduce una imagen a JPEG de lado máximo `max`. */
export async function reducirImagen(file: Blob, max: number, calidad = 0.88): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo leer la imagen"))), "image/jpeg", calidad));
}

export function duracionVideo(file: File): Promise<number> {
  return new Promise((ok, mal) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); ok(v.duration); };
    v.onerror = () => mal(new Error("No se pudo leer el video"));
    v.src = URL.createObjectURL(file);
  });
}
