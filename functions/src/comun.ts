import { getFirestore, Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { BLOQUEO_MS, VIDAS_POR_DIA, diaDe } from "./reglas.js";

export const db = (): Firestore => getFirestore();

/** Error que el cliente muestra tal cual. `codigo` sirve para que la app reaccione (p. ej. abrir la tienda). */
export function fallo(codigo: string, mensaje: string, tipo: "failed-precondition" | "invalid-argument" | "not-found" | "permission-denied" | "already-exists" = "failed-precondition"): never {
  throw new HttpsError(tipo, mensaje, { codigo });
}

export function texto(v: unknown, campo: string, max: number, min = 1): string {
  if (typeof v !== "string") fallo("dato-invalido", `Falta ${campo}.`, "invalid-argument");
  const t = v.trim();
  if (t.length < min) fallo("dato-invalido", `Falta ${campo}.`, "invalid-argument");
  if (t.length > max) fallo("dato-invalido", `${campo} es demasiado largo (máximo ${max}).`, "invalid-argument");
  return t;
}

export function id(v: unknown, campo = "el identificador"): string {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(v)) fallo("dato-invalido", `Falta ${campo}.`, "invalid-argument");
  return v;
}

export type Privado = {
  monedas: number;
  /** Parte de `monedas` que es regalo (se gasta primero y no genera ganancias). */
  monedasRegalo?: number;
  /** uid de quien lo invitó, y si esa invitación ya contó (al jugar su primera foto). */
  referidoPor?: string | null;
  referidoContado?: boolean;
  vidas: number;
  vidasVuelvenEn: Timestamp | null;
  vidasDia: string | null;
  gananciasEnEspera: number;
  gananciasDisponibles: number;
  ajustes?: Record<string, boolean>;
};

/**
 * Vidas del jugador ya recuperadas a `ahora`:
 * - Sin vidas: vuelven las 3 cuando pasan las 24 horas del bloqueo.
 * - Con alguna vida gastada: vuelven las 3 al empezar un día nuevo.
 */
export function vidasActuales(p: Privado, ahora: Date): { vidas: number; vidasVuelvenEn: Timestamp | null; cambiado: boolean } {
  if (p.vidas <= 0) {
    if (!p.vidasVuelvenEn || p.vidasVuelvenEn.toMillis() <= ahora.getTime()) {
      return { vidas: VIDAS_POR_DIA, vidasVuelvenEn: null, cambiado: true };
    }
    return { vidas: 0, vidasVuelvenEn: p.vidasVuelvenEn, cambiado: false };
  }
  if (p.vidas < VIDAS_POR_DIA && p.vidasDia !== diaDe(ahora)) {
    return { vidas: VIDAS_POR_DIA, vidasVuelvenEn: null, cambiado: true };
  }
  return { vidas: p.vidas, vidasVuelvenEn: p.vidasVuelvenEn ?? null, cambiado: false };
}

export function bloqueoHasta(ahora: Date): Timestamp {
  return Timestamp.fromMillis(ahora.getTime() + BLOQUEO_MS);
}

/** Lee los datos privados del jugador dentro de una transacción; falla si no terminó el registro. */
export async function leerPrivado(tx: Transaction, uid: string): Promise<Privado> {
  const snap = await tx.get(db().doc(`private/${uid}`));
  if (!snap.exists) fallo("sin-perfil", "Termina tu registro para jugar.");
  return snap.data() as Privado;
}

export function mezclar<T>(arr: T[], aleatorio: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** ¿`dueno` bloqueó a `uid`? (dentro de una transacción si se pasa `tx`). */
export async function bloqueadoPor(dueno: string, uid: string, tx?: Transaction): Promise<boolean> {
  if (dueno === uid) return false;
  const ref = db().doc(`users/${dueno}/bloqueados/${uid}`);
  return (tx ? await tx.get(ref) : await ref.get()).exists;
}
