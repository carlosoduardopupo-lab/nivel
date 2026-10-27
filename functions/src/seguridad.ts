// Seguridad y cuenta: bloquear usuarios, reportar reels y problemas, y eliminar la cuenta.
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { db, fallo } from "./comun.js";
import { MOTIVOS_REPORTE, REPORTES_PARA_OCULTAR } from "./reglas.js";
import { exigirPerfil } from "./social.js";

// ---------------------------------------------------------------------------
// Bloqueos: users/{uid}/bloqueados/{otroId}. Quien bloquea deja de ver al otro, y el otro
// ya no puede seguirle ni comentar en sus fotos o reels.

export async function bloquear(uid: string, datos: { otroId: string; valor: boolean }): Promise<{ bloqueado: boolean }> {
  const { otroId } = datos;
  if (otroId === uid) fallo("dato-invalido", "No puedes bloquearte a ti mismo.", "invalid-argument");
  await db().runTransaction(async (tx) => {
    const refBloqueo = db().doc(`users/${uid}/bloqueados/${otroId}`);
    const refSigo = db().doc(`users/${uid}/siguiendo/${otroId}`);
    const refMeSigue = db().doc(`users/${otroId}/siguiendo/${uid}`);
    const [otro, bloqueo, sigo, meSigue] = await Promise.all([tx.get(db().doc(`users/${otroId}`)), tx.get(refBloqueo), tx.get(refSigo), tx.get(refMeSigue)]);
    if (!datos.valor) {
      if (bloqueo.exists) tx.delete(refBloqueo);
      return;
    }
    if (!otro.exists) fallo("no-existe", "Ese usuario no existe.", "not-found");
    if (!bloqueo.exists) tx.set(refBloqueo, { creadoEn: Timestamp.now() });
    // Al bloquear se rompen los seguimientos en los dos sentidos.
    if (sigo.exists) {
      tx.delete(refSigo);
      tx.update(otro.ref, { seguidores: FieldValue.increment(-1) });
      tx.update(db().doc(`users/${uid}`), { siguiendo: FieldValue.increment(-1) });
    }
    if (meSigue.exists) {
      tx.delete(refMeSigue);
      tx.update(db().doc(`users/${uid}`), { seguidores: FieldValue.increment(-1) });
      tx.update(otro.ref, { siguiendo: FieldValue.increment(-1) });
    }
  });
  return { bloqueado: datos.valor };
}

// ---------------------------------------------------------------------------
// Reportes de reels (igual que las fotos: con 3 se ocultan hasta revisarlos) y de problemas.

export async function reportarReel(uid: string, datos: { reelId: string; motivo: unknown; detalle?: unknown }): Promise<void> {
  const { reelId } = datos;
  const motivo = datos.motivo as (typeof MOTIVOS_REPORTE)[number];
  if (!MOTIVOS_REPORTE.includes(motivo)) fallo("dato-invalido", "Elige un motivo.", "invalid-argument");
  const detalle = typeof datos.detalle === "string" ? datos.detalle.trim().slice(0, 300) : "";
  await exigirPerfil(uid);
  await db().runTransaction(async (tx) => {
    const refReel = db().doc(`reels/${reelId}`);
    const refRep = db().doc(`reportes/reel_${reelId}_${uid}`);
    const [reel, rep] = await Promise.all([tx.get(refReel), tx.get(refRep)]);
    if (!reel.exists) fallo("no-existe", "Ese reel no existe.", "not-found");
    if (rep.exists) return;
    tx.set(refRep, { tipo: "reel", reelId, autorId: uid, motivo, detalle, estado: "abierto", creadoEn: Timestamp.now() });
    const total = (reel.get("reportes") ?? 0) + 1;
    const cambios: Record<string, unknown> = { reportes: total };
    if (total >= REPORTES_PARA_OCULTAR && reel.get("estado") === "publicado") cambios.estado = "oculto";
    tx.update(refReel, cambios);
  });
}

export async function reportarProblema(uid: string, datos: { texto: unknown }): Promise<void> {
  const texto = typeof datos.texto === "string" ? datos.texto.trim() : "";
  if (texto.length < 5) fallo("dato-invalido", "Cuéntanos un poco más (mínimo 5 caracteres).", "invalid-argument");
  if (texto.length > 1000) fallo("dato-invalido", "Máximo 1000 caracteres.", "invalid-argument");
  const username = await exigirPerfil(uid);
  await db().collection("problemas").add({ autorId: uid, username, texto, estado: "abierto", creadoEn: Timestamp.now() });
}

// ---------------------------------------------------------------------------
// Eliminar la cuenta. Se borra todo lo del usuario, salvo las fotos que otras personas ya
// desbloquearon: esas quedan "eliminadas" (fuera del feed) en la colección de quien las tiene.

export async function eliminarCuenta(uid: string, opciones = { borrarAcceso: true }): Promise<void> {
  const refUser = db().doc(`users/${uid}`);
  const user = await refUser.get();
  const rutas: string[] = [];
  const borrar = (r: unknown) => { if (typeof r === "string") rutas.push(r); };

  // Publicaciones.
  for (const p of (await db().collection("posts").where("creadorId", "==", uid).get()).docs) {
    const estado = p.get("estado");
    if (estado === "eliminada") continue;
    if (estado === "aprobada" && (p.get("desbloqueos") ?? 0) > 0) {
      await p.ref.update({ estado: "eliminada", eliminadaEn: FieldValue.serverTimestamp(), cuentaEliminada: true });
      continue;
    }
    borrar(p.get("rutaOriginal"));
    borrar(p.get("rutaBorrosa"));
    await db().recursiveDelete(p.ref);
  }

  // Reels.
  for (const r of (await db().collection("reels").where("autorId", "==", uid).get()).docs) {
    borrar(r.get("rutaVideo"));
    borrar(r.get("rutaPortada"));
    await db().recursiveDelete(r.ref);
  }

  // Sus comentarios en fotos y reels de otros (bajan los contadores).
  for (const c of (await db().collectionGroup("comentarios").where("autorId", "==", uid).get()).docs) {
    const padre = c.ref.parent.parent;
    await c.ref.delete();
    if (padre) await padre.update({ comentarios: FieldValue.increment(-1) }).catch(() => {});
  }

  // A quién seguía: baja el contador de seguidores de cada uno.
  for (const s of (await refUser.collection("siguiendo").get()).docs) {
    await db().doc(`users/${s.id}`).update({ seguidores: FieldValue.increment(-1) }).catch(() => {});
  }

  if (user.get("avatarUrl")) rutas.push(`avatares/${uid}.jpg`);
  if (rutas.length) {
    const bucket = getStorage().bucket();
    await Promise.all(rutas.map((r) => bucket.file(r).delete({ ignoreNotFound: true })));
  }

  const username = user.get("username");
  if (typeof username === "string") await db().doc(`usernames/${username}`).delete();
  await db().recursiveDelete(refUser);
  await db().recursiveDelete(db().doc(`private/${uid}`));
  if (opciones.borrarAcceso) await getAuth().deleteUser(uid).catch((e: { code?: string }) => { if (e.code !== "auth/user-not-found") throw e; });
}
