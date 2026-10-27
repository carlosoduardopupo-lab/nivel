import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions/v2";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { db, fallo, texto } from "./comun.js";
import { MAX_PREGUNTA, MAX_RESPUESTA, PRECIO_MIN_FOTO, PRECIO_MIN_VIDEO, VIDEO_MAX_SEGUNDOS, precioMaximo, tiempoDe } from "./reglas.js";

const run = promisify(execFile);

type PreguntaEntrada = { texto: unknown; correcta: unknown; falsas: unknown };

export type DatosPublicacion = {
  tipo: unknown;
  precio: unknown;
  pregunta: unknown;
};

function validarPregunta(p: PreguntaEntrada) {
  const t = texto(p?.texto, "la pregunta", MAX_PREGUNTA, 3);
  const correcta = texto(p?.correcta, "la respuesta correcta", MAX_RESPUESTA);
  const falsas = Array.isArray(p?.falsas) ? p.falsas : [];
  const f1 = texto(falsas[0], "la primera respuesta falsa", MAX_RESPUESTA);
  const f2 = texto(falsas[1], "la segunda respuesta falsa", MAX_RESPUESTA);
  if (new Set([correcta, f1, f2].map((x) => x.toLowerCase())).size < 3) {
    fallo("respuestas-repetidas", "Las tres respuestas deben ser distintas.", "invalid-argument");
  }
  // La correcta se guarda en la posición 0; el orden se mezcla para cada jugador.
  return { texto: t, opciones: [correcta, f1, f2], correcta: 0 };
}

export async function crearPublicacion(uid: string, datos: DatosPublicacion, ahora = new Date()): Promise<{ postId: string; ruta: string }> {
  const tipo = datos.tipo;
  if (tipo !== "foto" && tipo !== "video") fallo("dato-invalido", "Elige foto o video.", "invalid-argument");
  const user = await db().doc(`users/${uid}`).get();
  if (!user.exists) fallo("sin-perfil", "Termina tu registro primero.");

  const precio = datos.precio;
  const min = tipo === "video" ? PRECIO_MIN_VIDEO : PRECIO_MIN_FOTO;
  const max = precioMaximo(user.get("esVip") === true);
  if (typeof precio !== "number" || !Number.isInteger(precio) || precio < min || precio > max) {
    fallo("precio-invalido", `El precio debe estar entre ${min} y ${max} monedas.`, "invalid-argument");
  }

  const pregunta = validarPregunta(datos.pregunta as PreguntaEntrada);

  const ref = db().collection("posts").doc();
  const ruta = `originales/${uid}/${ref.id}`;
  const lote = db().batch();
  lote.set(ref, {
    creadorId: uid,
    orden: null,
    tipo,
    precio,
    tiempo: tiempoDe(precio),
    estado: "subiendo",
    oculta: false,
    rutaOriginal: ruta,
    rutaBorrosa: null,
    meGusta: 0,
    desbloqueos: 0,
    fallos: 0,
    intentos: 0,
    reportes: 0,
    comentarios: 0,
    monedasGastadas: 0,
    creadoEn: Timestamp.fromDate(ahora),
  });
  // Una sola pregunta por foto. Si el jugador falla, al día siguiente le sale la de otra foto (ver juego.ts).
  lote.set(ref.collection("preguntas").doc("0"), { ...pregunta, autor: "creador" });
  await lote.commit();
  return { postId: ref.id, ruta };
}

// ---------------------------------------------------------------------------
// Al subir el archivo: quita metadatos (ubicación GPS, etc.), genera la versión
// borrosa y deja la publicación en revisión.

const RUTA_ORIGINAL = /^originales\/([^/]+)\/([^/]+)$/;

async function borrosaDeImagen(buf: Buffer): Promise<Buffer> {
  return sharp(buf).rotate().resize({ width: 360, height: 480, fit: "cover" }).blur(28).jpeg({ quality: 60 }).toBuffer();
}

export async function procesarSubida(bucketName: string, nombre: string, contentType: string | undefined, metadata: Record<string, string> | undefined): Promise<void> {
  const m = RUTA_ORIGINAL.exec(nombre);
  if (!m || metadata?.procesado === "1") return;
  const [, creadorId, postId] = m;
  const bucket = getStorage().bucket(bucketName);
  const archivo = bucket.file(nombre);
  const refPost = db().doc(`posts/${postId}`);
  const post = await refPost.get();

  if (!post.exists || post.get("creadorId") !== creadorId || post.get("estado") !== "subiendo") {
    logger.warn("Subida sin publicación válida; se borra", { nombre });
    await archivo.delete({ ignoreNotFound: true });
    return;
  }

  const rechazar = async (motivo: string) => {
    await refPost.update({ estado: "rechazada", motivoRechazo: motivo, rutaOriginal: null });
    await archivo.delete({ ignoreNotFound: true });
  };

  const tipo = post.get("tipo") as "foto" | "video";
  const esImagen = contentType?.startsWith("image/");
  const esVideo = contentType?.startsWith("video/");
  if ((tipo === "foto" && !esImagen) || (tipo === "video" && !esVideo)) return rechazar("tipo-incorrecto");

  const [buf] = await archivo.download();
  let limpio: Buffer;
  let borrosa: Buffer;
  let tipoFinal = contentType!;

  try {
    if (tipo === "foto") {
      limpio = await sharp(buf).rotate().jpeg({ quality: 88 }).toBuffer();
      tipoFinal = "image/jpeg";
      borrosa = await borrosaDeImagen(limpio);
    } else {
      const dir = await mkdtemp(join(tmpdir(), "nivel-"));
      try {
        const entrada = join(dir, "entrada");
        const salida = join(dir, "salida.mp4");
        const cuadro = join(dir, "cuadro.jpg");
        await writeFile(entrada, buf);
        const segundos = await duracionVideo(entrada);
        if (segundos === null) return rechazar("video-invalido");
        if (segundos > VIDEO_MAX_SEGUNDOS + 0.5) return rechazar("video-largo");
        await run(ffmpegPath!, ["-y", "-i", entrada, "-map_metadata", "-1", "-c", "copy", "-movflags", "+faststart", salida]);
        await run(ffmpegPath!, ["-y", "-ss", String(Math.min(1, segundos / 2)), "-i", entrada, "-frames:v", "1", cuadro]);
        limpio = await readFile(salida);
        tipoFinal = "video/mp4";
        borrosa = await borrosaDeImagen(await readFile(cuadro));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  } catch (e) {
    logger.error("No se pudo procesar la subida", { nombre, e: String(e) });
    return rechazar("archivo-invalido");
  }

  const rutaBorrosa = `borrosas/${postId}.jpg`;
  await bucket.file(rutaBorrosa).save(borrosa, { contentType: "image/jpeg", metadata: { cacheControl: "public, max-age=86400" } });
  await archivo.save(limpio, { contentType: tipoFinal, metadata: { metadata: { procesado: "1" } } });
  await refPost.update({ rutaBorrosa, estado: "revision", procesadoEn: FieldValue.serverTimestamp() });
}

/** Duración en segundos según ffmpeg, o null si no es un video legible. */
async function duracionVideo(ruta: string): Promise<number | null> {
  // ffmpeg sin salida termina con error, pero imprime la duración en stderr.
  const r = await run(ffmpegPath!, ["-hide_banner", "-i", ruta]).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr);
  if (!m) return null;
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}

/** El creador consulta la pregunta de su propia publicación (el cliente nunca la lee directo). */
export async function miPregunta(uid: string, datos: { postId: string }): Promise<{ texto: string; respuesta: string; falsas: string[] }> {
  const ref = db().doc(`posts/${datos.postId}`);
  const post = await ref.get();
  if (!post.exists || post.get("creadorId") !== uid) fallo("no-existe", "Esa publicación no existe.", "not-found");
  const p = (await ref.collection("preguntas").doc("0").get()).data()!;
  return { texto: p.texto, respuesta: p.opciones[p.correcta], falsas: (p.opciones as string[]).filter((_, i) => i !== p.correcta) };
}
