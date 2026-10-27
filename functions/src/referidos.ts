// Referidos: un amigo invitado "cuenta" cuando juega su primera foto (no solo al registrarse),
// para que crear cuentas vacías no dé premios. Al contar:
// - quien invitó recupera sus 3 vidas (como máximo una recarga al día);
// - al tercer amigo gana 500 monedas de regalo, una sola vez.
import { FieldValue, Timestamp, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { db, type Privado } from "./comun.js";
import { MAX_MONEDAS_REFERIDOS, MONEDAS_POR_REFERIDO, VIDAS_POR_DIA, diaDe } from "./reglas.js";

/** Lee a quien invitó al jugador si su invitación aún no ha contado (lectura: va antes de escribir). */
export async function leerInvitador(tx: Transaction, privado: Privado): Promise<DocumentSnapshot | null> {
  if (!privado.referidoPor || privado.referidoContado) return null;
  const snap = await tx.get(db().doc(`private/${privado.referidoPor}`));
  return snap.exists ? snap : null;
}

/** Da los premios a quien invitó y marca la invitación como contada. */
export function contarReferido(tx: Transaction, uid: string, invitador: DocumentSnapshot | null, ahora: Date): void {
  if (!invitador) return;
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
}
