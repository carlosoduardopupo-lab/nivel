import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./comun.js";
import { precioPromedio } from "./reglas.js";

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
    const [creador, otras] = await Promise.all([
      tx.get(refCreador),
      tx.get(db().collection("posts").where("creadorId", "==", post.get("creadorId")).where("estado", "==", "aprobada")),
    ]);
    // siguienteOrden existe desde que se pueden eliminar publicaciones (antes, numPublicaciones).
    const orden: number = creador.get("siguienteOrden") ?? creador.get("numPublicaciones") ?? 0;
    const precio: number = post.get("precio");
    const t = Timestamp.fromDate(ahora);
    tx.update(refPost, { estado: "aprobada", orden, aprobadaEn: t });
    tx.update(refCreador, {
      numPublicaciones: FieldValue.increment(1),
      siguienteOrden: orden + 1,
      esCreador: true,
      ultimaPublicacionEn: t,
      precioPromedio: precioPromedio([...otras.docs.map((d) => d.get("precio") as number), precio]),
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
