// Estadísticas de uso: un documento por día (hora de Nueva York) con contadores.
//   estadisticas/{AAAA-MM-DD} = { registros, activos, intentos, aciertos, pagos, monedasGastadas, ... }
// Solo los lee el administrador (reglas). Contar nunca debe romper la acción que se cuenta.
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { db, fallo } from "./comun.js";
import { diaDe } from "./reglas.js";

export const CAMPOS = [
  "registros", "activos", "intentos", "aciertos", "pagos", "monedasGastadas",
  "publicaciones", "reels", "comentarios", "seguimientos", "referidos",
  "compartidos", "instalaciones", "visitasDescarga", "descargasApk",
] as const;
export type Campo = (typeof CAMPOS)[number];

/** Suma a los contadores del día. */
export async function contar(cambios: Partial<Record<Campo, number>>, ahora = new Date()): Promise<void> {
  const datos: Record<string, unknown> = { actualizadoEn: Timestamp.fromDate(ahora) };
  for (const [k, n] of Object.entries(cambios)) if (n) datos[k] = FieldValue.increment(n);
  try {
    await db().doc(`estadisticas/${diaDe(ahora)}`).set(datos, { merge: true });
  } catch (e) {
    logger.warn("No se pudo contar", { cambios, e: String(e) });
  }
}

/** Una vez al día por usuario, al abrir la app: cuenta como usuario activo. */
export async function registrarVisita(uid: string, ahora = new Date()): Promise<void> {
  const hoy = diaDe(ahora);
  const nuevo = await db().runTransaction(async (tx) => {
    const ref = db().doc(`private/${uid}`);
    const p = await tx.get(ref);
    if (!p.exists || p.get("ultimaVisita") === hoy) return false;
    tx.update(ref, { ultimaVisita: hoy });
    return true;
  });
  if (nuevo) await contar({ activos: 1 }, ahora);
}

// Eventos que solo conoce la web (el usuario comparte o instala la app).
const EVENTOS_APP: Record<string, Campo> = { compartir: "compartidos", instalar: "instalaciones" };
// Eventos de la página pública de descarga (sin sesión).
const EVENTOS_PUBLICOS: Record<string, Campo> = { visita: "visitasDescarga", apk: "descargasApk", instalar: "instalaciones" };

export async function eventoApp(datos: { tipo: unknown }): Promise<void> {
  const campo = typeof datos.tipo === "string" ? EVENTOS_APP[datos.tipo] : undefined;
  if (!campo) fallo("dato-invalido", "Evento desconocido.", "invalid-argument");
  await contar({ [campo]: 1 });
}

export async function eventoPublico(tipo: unknown): Promise<boolean> {
  const campo = typeof tipo === "string" ? EVENTOS_PUBLICOS[tipo] : undefined;
  if (!campo) return false;
  await contar({ [campo]: 1 });
  return true;
}
