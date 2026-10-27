// Referidos: un amigo invitado "cuenta" cuando juega su primera foto (no solo al registrarse),
// para que crear cuentas vacías no dé premios. Al contar:
// - quien invitó recupera sus 3 vidas (como máximo una recarga al día);
// - al tercer amigo gana 500 monedas de regalo, una sola vez.
import { FieldValue, Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { db, type Privado } from "./comun.js";
import { notificar } from "./notificaciones.js";
import { contar } from "./estadisticas.js";
import { MAX_MONEDAS_REFERIDOS, MONEDAS_POR_REFERIDO, VIDAS_POR_DIA, diaDe } from "./reglas.js";

/** Lee a quien invitó al jugador si su invitación aún no ha contado (lectura: va antes de escribir). */
export async function leerInvitador(tx: Transaction, privado: Privado): Promise<DocumentSnapshot | null> {
  if (!privado.referidoPor || privado.referidoContado) return null;
  const snap = await tx.get(db().doc(`private/${privado.referidoPor}`));
  return snap.exists ? snap : null;
}

export type ReferidoContado = { invitadorId: string; recarga: boolean; monedas: number };

/** Da los premios a quien invitó y marca la invitación como contada. Devuelve qué se dio (para avisar). */
export function contarReferido(tx: Transaction, uid: string, invitador: DocumentSnapshot | null, ahora: Date): ReferidoContado | null {
  if (!invitador) return null;
  const hoy = diaDe(ahora);
  const yaInvitados: number = invitador.get("referidos") ?? 0;
  const monedas = Math.max(0, Math.min(MONEDAS_POR_REFERIDO[yaInvitados] ?? 0, MAX_MONEDAS_REFERIDOS - (invitador.get("monedasReferidos") ?? 0)));
  const recarga = invitador.get("vidasReferidoDia") !== hoy;
  tx.update(invitador.ref, {
    referidos: FieldValue.increment(1),
    monedas: FieldValue.increment(monedas),
    monedasRegalo: FieldValue.increment(monedas),
    monedasReferidos: FieldValue.increment(monedas),
    // Recarga de vidas: vuelven a 3 (también quita el bloqueo de 24 h), una vez al día.
    ...(recarga ? { vidas: VIDAS_POR_DIA, vidasVuelvenEn: null, vidasDia: null, vidasReferidoDia: hoy } : {}),
  });
  tx.set(invitador.ref.collection("referidos").doc(uid), { estado: "contado", monedas, recargaVidas: recarga, contadoEn: Timestamp.fromDate(ahora) }, { merge: true });
  tx.update(db().doc(`private/${uid}`), { referidoContado: true });
  return { invitadorId: invitador.id, recarga, monedas };
}

/** Aviso a quien invitó, después de la transacción. */
export async function avisarReferido(uid: string, r: ReferidoContado | null): Promise<void> {
  if (!r) return;
  await contar({ referidos: 1 });
  const username = (await db().doc(`users/${uid}`).get()).get("username") ?? "tu amigo";
  const premio = [r.recarga ? "tus 3 vidas" : "", r.monedas ? `${r.monedas} monedas` : ""].filter(Boolean).join(" y ");
  await notificar(r.invitadorId, {
    tipo: "vidas",
    titulo: `@${username} ya juega en Blurry gracias a ti`,
    texto: premio ? `Ganaste ${premio}.` : "Sigue invitando: cada amigo cuenta.",
    url: "/?ir=feed",
  });
}
