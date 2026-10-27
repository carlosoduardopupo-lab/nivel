import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { bloqueadoPor, db, fallo, texto } from "./comun.js";
import { avisarComentario } from "./notificaciones.js";
import { contar } from "./estadisticas.js";
import { MAX_COMENTARIO, MOTIVOS_REPORTE, REPORTES_PARA_OCULTAR } from "./reglas.js";

export async function exigirPerfil(uid: string): Promise<string> {
  const snap = await db().doc(`users/${uid}`).get();
  if (!snap.exists) fallo("sin-perfil", "Termina tu registro primero.");
  return snap.get("username") as string;
}

export async function seguir(uid: string, datos: { creadorId: string }): Promise<void> {
  const { creadorId } = datos;
  if (creadorId === uid) fallo("dato-invalido", "No puedes seguirte a ti mismo.", "invalid-argument");
  let nuevo = false;
  await db().runTransaction(async (tx) => {
    const ref = db().doc(`users/${uid}/siguiendo/${creadorId}`);
    const [yo, creador, ya] = await Promise.all([tx.get(db().doc(`users/${uid}`)), tx.get(db().doc(`users/${creadorId}`)), tx.get(ref)]);
    if (!yo.exists) fallo("sin-perfil", "Termina tu registro primero.");
    if (!creador.exists) fallo("no-existe", "Ese usuario no existe.", "not-found");
    if (await bloqueadoPor(creadorId, uid, tx)) fallo("bloqueado", "No puedes seguir a este usuario.", "permission-denied");
    if (ya.exists) return;
    nuevo = true;
    // creadorId: para encontrar a los seguidores de un creador (avisos de fotos nuevas).
    tx.set(ref, { creadorId, creadoEn: Timestamp.now() });
    tx.update(creador.ref, { seguidores: FieldValue.increment(1) });
    tx.update(yo.ref, { siguiendo: FieldValue.increment(1) });
  });
  if (nuevo) await contar({ seguimientos: 1 });
}

export async function dejarDeSeguir(uid: string, datos: { creadorId: string }): Promise<void> {
  const { creadorId } = datos;
  await db().runTransaction(async (tx) => {
    const ref = db().doc(`users/${uid}/siguiendo/${creadorId}`);
    const ya = await tx.get(ref);
    if (!ya.exists) return;
    tx.delete(ref);
    tx.update(db().doc(`users/${creadorId}`), { seguidores: FieldValue.increment(-1) });
    tx.update(db().doc(`users/${uid}`), { siguiendo: FieldValue.increment(-1) });
  });
}

/** Da o quita el me gusta. Solo quien desbloqueó la foto. */
export async function darMeGusta(uid: string, datos: { postId: string; valor: boolean }): Promise<{ meGusta: boolean }> {
  const { postId } = datos;
  const valor = datos.valor !== false;
  await db().runTransaction(async (tx) => {
    const refPost = db().doc(`posts/${postId}`);
    const refLike = refPost.collection("meGusta").doc(uid);
    const [post, desb, like] = await Promise.all([tx.get(refPost), tx.get(db().doc(`users/${uid}/desbloqueos/${postId}`)), tx.get(refLike)]);
    if (!post.exists) fallo("no-existe", "Esa foto no existe.", "not-found");
    if (!desb.exists) fallo("no-desbloqueada", "Desbloquea la foto para darle me gusta.");
    if (like.exists === valor) return;
    const d = valor ? 1 : -1;
    if (valor) tx.set(refLike, { creadoEn: Timestamp.now() });
    else tx.delete(refLike);
    tx.update(refPost, { meGusta: FieldValue.increment(d) });
    tx.update(db().doc(`users/${post.get("creadorId")}`), { totalMeGusta: FieldValue.increment(d) });
  });
  return { meGusta: valor };
}

/**
 * Comenta en una foto, o responde a un comentario (`respondeA`). Las respuestas
 * cuelgan siempre del comentario principal (un solo nivel) y guardan a quién
 * se responde para mostrar "@usuario".
 */
export async function comentar(uid: string, datos: { postId: string; texto: unknown; respondeA?: string }): Promise<{ id: string }> {
  const { postId } = datos;
  const t = texto(datos.texto, "el comentario", MAX_COMENTARIO);
  const username = await exigirPerfil(uid);
  const refPost = db().doc(`posts/${postId}`);
  const post = await refPost.get();
  if (!post.exists) fallo("no-existe", "Esa foto no existe.", "not-found");
  const creadorId = post.get("creadorId") as string;
  if (await bloqueadoPor(creadorId, uid)) fallo("bloqueado", "No puedes comentar aquí.", "permission-denied");
  if (creadorId !== uid) {
    const desb = await db().doc(`users/${uid}/desbloqueos/${postId}`).get();
    if (!desb.exists) fallo("no-desbloqueada", "Desbloquea la foto para comentar.");
    const priv = await db().doc(`private/${creadorId}`).get();
    if (priv.get("ajustes.comentar") === false) fallo("comentarios-cerrados", "Este creador no permite comentarios.");
  }
  const r = await escribirComentario(refPost, uid, username, t, datos.respondeA);
  await avisarComentario({ autorId: uid, autorUsername: username, duenoId: creadorId, texto: t, respondeAUid: r.respondeAUid, reel: false });
  await contar({ comentarios: 1 });
  return { id: r.id };
}

/** Guarda un comentario (o respuesta) en `{padre}/comentarios` y sube su contador. Lo usan fotos y reels. */
export async function escribirComentario(refPadre: DocumentReference, uid: string, username: string, t: string, respondeA?: string): Promise<{ id: string; respondeAUid?: string }> {
  let respuesta: { respondeA: string; respondeAUsername: string } | null = null;
  let respondeAUid: string | undefined;
  if (respondeA) {
    const padre = await refPadre.collection("comentarios").doc(respondeA).get();
    if (!padre.exists) fallo("no-existe", "Ese comentario ya no existe.", "not-found");
    respuesta = { respondeA: padre.get("respondeA") ?? padre.id, respondeAUsername: padre.get("username") };
    respondeAUid = padre.get("autorId");
  }
  const ref = refPadre.collection("comentarios").doc();
  const lote = db().batch();
  lote.set(ref, { autorId: uid, username, texto: t, creadoEn: Timestamp.now(), ...respuesta });
  lote.update(refPadre, { comentarios: FieldValue.increment(1) });
  await lote.commit();
  return { id: ref.id, respondeAUid };
}

export async function reportar(uid: string, datos: { postId: string; motivo: unknown; detalle?: unknown }): Promise<void> {
  const { postId } = datos;
  const motivo = datos.motivo as (typeof MOTIVOS_REPORTE)[number];
  if (!MOTIVOS_REPORTE.includes(motivo)) fallo("dato-invalido", "Elige un motivo.", "invalid-argument");
  const detalle = typeof datos.detalle === "string" ? datos.detalle.trim().slice(0, 300) : "";
  await exigirPerfil(uid);
  await db().runTransaction(async (tx) => {
    const refPost = db().doc(`posts/${postId}`);
    // Un reporte por persona y foto.
    const refRep = db().doc(`reportes/${postId}_${uid}`);
    const [post, rep] = await Promise.all([tx.get(refPost), tx.get(refRep)]);
    if (!post.exists) fallo("no-existe", "Esa foto no existe.", "not-found");
    if (rep.exists) return;
    tx.set(refRep, { postId, autorId: uid, motivo, detalle, estado: "abierto", creadoEn: Timestamp.now() });
    const total = (post.get("reportes") ?? 0) + 1;
    const cambios: Record<string, unknown> = { reportes: total };
    // Con 3 reportes se oculta sola hasta que la revise un administrador.
    if (total >= REPORTES_PARA_OCULTAR) cambios.oculta = true;
    tx.update(refPost, cambios);
  });
}
