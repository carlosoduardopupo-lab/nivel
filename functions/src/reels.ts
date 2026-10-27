// Reels: videos gratis para que los creadores se den a conocer e inviten a jugar.
// No tienen trivia ni precio. Cualquiera registrado los ve.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions/v2";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { bloqueadoPor, db, fallo, texto as textoValido } from "./comun.js";
import { escribirComentario, exigirPerfil } from "./social.js";
import { APROBACION_AUTOMATICA, MAX_COMENTARIO, MAX_TEXTO_REEL, REEL_MAX_SEGUNDOS } from "./reglas.js";

const run = promisify(execFile);

function textoReel(v: unknown): string {
  const t = typeof v === "string" ? v.trim() : "";
  if (t.length > MAX_TEXTO_REEL) fallo("dato-invalido", `El texto es demasiado largo (máximo ${MAX_TEXTO_REEL}).`, "invalid-argument");
  return t;
}

async function miReel(uid: string, reelId: string) {
  const ref = db().doc(`reels/${reelId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get("autorId") !== uid) fallo("no-existe", "Ese reel no existe.", "not-found");
  return { ref, snap };
}

/** Crea el reel en estado "subiendo" y devuelve dónde subir el video. */
export async function crearReel(uid: string, datos: { texto: unknown }, ahora = new Date()): Promise<{ reelId: string; ruta: string }> {
  const texto = textoReel(datos.texto);
  const user = await db().doc(`users/${uid}`).get();
  if (!user.exists) fallo("sin-perfil", "Termina tu registro primero.");
  const ref = db().collection("reels").doc();
  const ruta = `reels/${uid}/${ref.id}`;
  await ref.set({
    autorId: uid,
    texto,
    estado: "subiendo",
    rutaVideo: ruta,
    rutaPortada: null,
    duracion: null,
    meGusta: 0,
    comentarios: 0,
    creadoEn: Timestamp.fromDate(ahora),
  });
  return { reelId: ref.id, ruta };
}

export async function editarReel(uid: string, datos: { reelId: string; texto: unknown }): Promise<void> {
  const texto = textoReel(datos.texto);
  const { ref } = await miReel(uid, datos.reelId);
  await ref.update({ texto, editadoEn: FieldValue.serverTimestamp() });
}

export async function eliminarReel(uid: string, datos: { reelId: string }): Promise<void> {
  const { ref, snap } = await miReel(uid, datos.reelId);
  const rutas = [snap.get("rutaVideo"), snap.get("rutaPortada")].filter((r): r is string => typeof r === "string");
  if (rutas.length) {
    const bucket = getStorage().bucket();
    await Promise.all(rutas.map((r) => bucket.file(r).delete({ ignoreNotFound: true })));
  }
  await db().recursiveDelete(ref);
}

export async function meGustaReel(uid: string, datos: { reelId: string; valor: boolean }): Promise<{ meGusta: boolean }> {
  const valor = datos.valor !== false;
  await db().runTransaction(async (tx) => {
    const ref = db().doc(`reels/${datos.reelId}`);
    const refLike = ref.collection("meGusta").doc(uid);
    const [reel, like] = await Promise.all([tx.get(ref), tx.get(refLike)]);
    if (!reel.exists || reel.get("estado") !== "publicado") fallo("no-existe", "Ese reel no existe.", "not-found");
    if (like.exists === valor) return;
    if (valor) tx.set(refLike, { creadoEn: Timestamp.now() });
    else tx.delete(refLike);
    tx.update(ref, { meGusta: FieldValue.increment(valor ? 1 : -1) });
  });
  return { meGusta: valor };
}

/** Cualquier registrado comenta (o responde) en un reel publicado. */
export async function comentarReel(uid: string, datos: { reelId: string; texto: unknown; respondeA?: string }): Promise<{ id: string }> {
  const t = textoValido(datos.texto, "el comentario", MAX_COMENTARIO);
  const username = await exigirPerfil(uid);
  const ref = db().doc(`reels/${datos.reelId}`);
  const reel = await ref.get();
  if (!reel.exists || reel.get("estado") !== "publicado") fallo("no-existe", "Ese reel no existe.", "not-found");
  if (await bloqueadoPor(reel.get("autorId"), uid)) fallo("bloqueado", "No puedes comentar aquí.", "permission-denied");
  return escribirComentario(ref, uid, username, t, datos.respondeA);
}

// ---------------------------------------------------------------------------
// Al subir el video: quita metadatos, comprueba la duración y saca una portada.

export const RUTA_REEL = /^reels\/([^/]+)\/([^/]+)$/;

export async function procesarReel(bucketName: string, nombre: string, contentType: string | undefined, metadata: Record<string, string> | undefined): Promise<void> {
  const m = RUTA_REEL.exec(nombre);
  if (!m || metadata?.procesado === "1") return;
  const [, autorId, reelId] = m;
  const bucket = getStorage().bucket(bucketName);
  const archivo = bucket.file(nombre);
  const ref = db().doc(`reels/${reelId}`);
  const reel = await ref.get();

  if (!reel.exists || reel.get("autorId") !== autorId || reel.get("estado") !== "subiendo") {
    logger.warn("Reel sin documento válido; se borra", { nombre });
    await archivo.delete({ ignoreNotFound: true });
    return;
  }
  const rechazar = async (motivo: string) => {
    await ref.update({ estado: "rechazado", motivoRechazo: motivo, rutaVideo: null });
    await archivo.delete({ ignoreNotFound: true });
  };
  if (!contentType?.startsWith("video/")) return rechazar("tipo-incorrecto");

  const dir = await mkdtemp(join(tmpdir(), "reel-"));
  try {
    const entrada = join(dir, "entrada");
    const salida = join(dir, "salida.mp4");
    const cuadro = join(dir, "cuadro.jpg");
    const [buf] = await archivo.download();
    await writeFile(entrada, buf);
    const r = await run(ffmpegPath!, ["-hide_banner", "-i", entrada]).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
    const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr);
    if (!d) return rechazar("video-invalido");
    const segundos = +d[1] * 3600 + +d[2] * 60 + +d[3];
    if (segundos > REEL_MAX_SEGUNDOS + 0.5) return rechazar("video-largo");
    await run(ffmpegPath!, ["-y", "-i", entrada, "-map_metadata", "-1", "-c", "copy", "-movflags", "+faststart", salida]);
    await run(ffmpegPath!, ["-y", "-ss", String(Math.min(1, segundos / 2)), "-i", entrada, "-frames:v", "1", cuadro]);
    const portada = await sharp(await readFile(cuadro)).resize({ width: 540, height: 960, fit: "cover" }).jpeg({ quality: 75 }).toBuffer();
    // Los reels son públicos para registrados: con token se pueden reproducir por streaming (getDownloadURL).
    const rutaPortada = `portadas-reels/${reelId}.jpg`;
    await bucket.file(rutaPortada).save(portada, { contentType: "image/jpeg", metadata: { cacheControl: "public, max-age=86400", metadata: { firebaseStorageDownloadTokens: randomUUID() } } });
    await archivo.save(await readFile(salida), { contentType: "video/mp4", metadata: { metadata: { procesado: "1", firebaseStorageDownloadTokens: randomUUID() } } });
    await ref.update({ estado: APROBACION_AUTOMATICA ? "publicado" : "revision", rutaPortada, duracion: Math.round(segundos), publicadoEn: FieldValue.serverTimestamp() });
  } catch (e) {
    logger.error("No se pudo procesar el reel", { nombre, e: String(e) });
    return rechazar("archivo-invalido");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
