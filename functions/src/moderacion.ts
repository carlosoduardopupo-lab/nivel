import { Timestamp } from "firebase-admin/firestore";
import { db } from "./comun.js";

/**
 * Aprueba una publicación en revisión: le asigna el siguiente nivel de la fila
 * del creador y la hace visible. Lo usan el script de administrador y, más
 * adelante, la moderación automática.
 */
export async function aprobarPublicacion(postId: string, ahora = new Date()): Promise<{ orden: number }> {
  return db().runTransaction(async (tx) => {
    const refPost = db().doc(`posts/${postId}`);
    const post = await tx.get(refPost);
    if (!post.exists) throw new Error(`No existe la publicación ${postId}`);
    if (post.get("estado") !== "revision") throw new Error(`La publicación ${postId} está en estado "${post.get("estado")}", no en revisión`);
    const refCreador = db().doc(`users/${post.get("creadorId")}`);
    const creador = await tx.get(refCreador);
    const orden: number = creador.get("numPublicaciones") ?? 0;
    const precio: number = post.get("precio");
    const minimo: number | null = creador.get("precioMinimo") ?? null;
    const t = Timestamp.fromDate(ahora);
    tx.update(refPost, { estado: "aprobada", orden, aprobadaEn: t });
    tx.update(refCreador, {
      numPublicaciones: orden + 1,
      esCreador: true,
      ultimaPublicacionEn: t,
      precioMinimo: minimo === null ? precio : Math.min(minimo, precio),
    });
    return { orden };
  });
}

export async function rechazarPublicacion(postId: string, motivo: string): Promise<void> {
  const refPost = db().doc(`posts/${postId}`);
  const post = await refPost.get();
  if (!post.exists) throw new Error(`No existe la publicación ${postId}`);
  if (post.get("estado") === "aprobada") throw new Error("Ya está aprobada; para retirarla márcala como oculta.");
  await refPost.update({ estado: "rechazada", motivoRechazo: motivo });
}
