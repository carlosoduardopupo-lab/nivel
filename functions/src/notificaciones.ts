// Notificaciones: se guardan en private/{uid}/notificaciones (la campana de la app) y se envían
// como push (Firebase Cloud Messaging) a los dispositivos de private/{uid}/dispositivos/{token}.
// Cada tipo respeta su interruptor de Ajustes.
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions/v2";
import { db, fallo } from "./comun.js";

export type TipoNotificacion = "nuevas" | "vidas" | "comentarios" | "ganancias";

export type Notificacion = {
  tipo: TipoNotificacion;
  titulo: string;
  texto: string;
  /** Adónde lleva al tocarla, dentro de la app (por ejemplo "/?u=usuario" o "/?ir=perfil"). */
  url: string;
  /** uid de quien la provoca (para no avisar de usuarios bloqueados). */
  de?: string;
};

// Se pueden desactivar en Ajustes → Notificaciones; las que no existen en los ajustes de una cuenta
// antigua cuentan como activadas, salvo los comentarios (desactivados por defecto).
const POR_DEFECTO: Record<TipoNotificacion, boolean> = { nuevas: true, vidas: true, comentarios: false, ganancias: true };

/** Guarda la notificación y la envía como push. Nunca lanza: un aviso fallido no debe romper la acción. */
export async function notificar(uid: string, n: Notificacion): Promise<void> {
  try {
    if (n.de === uid) return;
    const priv = await db().doc(`private/${uid}`).get();
    if (!priv.exists) return;
    const activa = priv.get(`ajustes.${n.tipo}`);
    if (activa === false || (activa === undefined && !POR_DEFECTO[n.tipo])) return;
    if (n.de && (await db().doc(`users/${uid}/bloqueados/${n.de}`).get()).exists) return;

    await priv.ref.collection("notificaciones").add({ ...n, leida: false, creadoEn: Timestamp.now() });

    const tokens = (await priv.ref.collection("dispositivos").get()).docs.map((d) => d.id);
    if (!tokens.length) return;
    const r = await getMessaging().sendEachForMulticast({
      tokens,
      // Solo datos: el service worker de la web la muestra (así controla el icono y el enlace).
      data: { titulo: n.titulo, texto: n.texto, url: n.url, tipo: n.tipo },
      webpush: { headers: { Urgency: "normal", TTL: String(3 * 24 * 3600) } },
    });
    // Los tokens caducados o desinstalados se borran.
    await Promise.all(r.responses.map((x, i) => {
      const c = x.error?.code ?? "";
      return c.includes("registration-token-not-registered") || c.includes("invalid-registration-token") || c.includes("invalid-argument")
        ? priv.ref.collection("dispositivos").doc(tokens[i]).delete()
        : null;
    }));
  } catch (e) {
    logger.warn("No se pudo notificar", { uid, tipo: n.tipo, e: String(e) });
  }
}

/** Guarda el token de push de este dispositivo. */
export async function registrarDispositivo(uid: string, datos: { token: unknown }): Promise<void> {
  const token = typeof datos.token === "string" ? datos.token.trim() : "";
  if (token.length < 20 || token.length > 4096 || token.includes("/")) fallo("dato-invalido", "Token no válido.", "invalid-argument");
  await db().doc(`private/${uid}/dispositivos/${token}`).set({ creadoEn: FieldValue.serverTimestamp() }, { merge: true });
}

export async function borrarDispositivo(uid: string, datos: { token: unknown }): Promise<void> {
  const token = typeof datos.token === "string" ? datos.token.trim() : "";
  if (!token || token.includes("/")) return;
  await db().doc(`private/${uid}/dispositivos/${token}`).delete();
}

/** Marca como leídas todas las notificaciones (al abrir la campana). */
export async function marcarLeidas(uid: string): Promise<void> {
  const s = await db().collection(`private/${uid}/notificaciones`).where("leida", "==", false).limit(400).get();
  if (s.empty) return;
  const b = db().batch();
  s.docs.forEach((d) => b.update(d.ref, { leida: true }));
  await b.commit();
}

// ---------------------------------------------------------------------------
// Avisos concretos.

/** Al aprobarse una publicación: a todos sus seguidores. */
export async function avisarFotoNueva(creadorId: string): Promise<void> {
  const creador = await db().doc(`users/${creadorId}`).get();
  const username = creador.get("username");
  const seguidores = await db().collectionGroup("siguiendo").where("creadorId", "==", creadorId).get();
  await Promise.all(seguidores.docs.map((d) => {
    const uid = d.ref.parent.parent?.id;
    return uid ? notificar(uid, { tipo: "nuevas", titulo: `@${username} subió una foto nueva`, texto: "Está borrosa… ¿adivinas qué hay detrás?", url: `/?u=${encodeURIComponent(username)}`, de: creadorId }) : null;
  }));
}

/** Al comentar: al dueño de la foto o reel y, si es una respuesta, a quien se responde. */
export async function avisarComentario(datos: { autorId: string; autorUsername: string; duenoId: string; texto: string; respondeAUid?: string; reel: boolean }): Promise<void> {
  const cosa = datos.reel ? "tu reel" : "tu foto";
  const corto = datos.texto.length > 80 ? datos.texto.slice(0, 77) + "…" : datos.texto;
  const avisos: Promise<void>[] = [];
  if (datos.respondeAUid && datos.respondeAUid !== datos.autorId) {
    avisos.push(notificar(datos.respondeAUid, { tipo: "comentarios", titulo: `@${datos.autorUsername} te respondió`, texto: corto, url: datos.reel ? "/?ir=reels" : `/?u=${encodeURIComponent(datos.autorUsername)}`, de: datos.autorId }));
  }
  if (datos.duenoId !== datos.autorId && datos.duenoId !== datos.respondeAUid) {
    avisos.push(notificar(datos.duenoId, { tipo: "comentarios", titulo: `@${datos.autorUsername} comentó ${cosa}`, texto: corto, url: "/?ir=perfil", de: datos.autorId }));
  }
  await Promise.all(avisos);
}

/** Avisa a quien se quedó sin vidas cuando vuelven (lo llama una tarea cada 15 minutos). */
export async function avisarVidasDevueltas(ahora = new Date()): Promise<number> {
  const desde = Timestamp.fromMillis(ahora.getTime() - 24 * 3600 * 1000);
  const s = await db().collection("private")
    .where("vidasVuelvenEn", ">=", desde).where("vidasVuelvenEn", "<=", Timestamp.fromDate(ahora)).get();
  let n = 0;
  for (const d of s.docs) {
    const vuelven = d.get("vidasVuelvenEn") as Timestamp;
    if (d.get("vidasAvisoEn")?.toMillis?.() === vuelven.toMillis()) continue;
    await d.ref.update({ vidasAvisoEn: vuelven });
    await notificar(d.id, { tipo: "vidas", titulo: "¡Tus 3 vidas han vuelto!", texto: "Ya puedes seguir adivinando.", url: "/?ir=feed" });
    n++;
  }
  return n;
}
