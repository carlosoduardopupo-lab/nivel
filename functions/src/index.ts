import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, onRequest, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { id } from "./comun.js";
import * as cuenta from "./cuenta.js";
import * as escaparate from "./escaparate.js";
import * as estadisticas from "./estadisticas.js";
import * as juego from "./juego.js";
import * as notificaciones from "./notificaciones.js";
import * as pagos from "./pagos.js";
import * as publicaciones from "./publicaciones.js";
import * as reels from "./reels.js";
import * as seguridad from "./seguridad.js";
import * as social from "./social.js";

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

function uidDe(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");
  return req.auth.uid;
}

type D = Record<string, unknown>;
const datos = (req: CallableRequest) => (req.data ?? {}) as D;

// Cuenta
export const nombreDisponible = onCall((req) => cuenta.nombreDisponible({ username: datos(req).username }));
export const registrar = onCall((req) => {
  const uid = uidDe(req);
  const d = datos(req);
  return cuenta.registrar(uid, req.auth?.token.email ?? null, {
    username: d.username, nombreReal: d.nombreReal, fechaNacimiento: d.fechaNacimiento, intereses: d.intereses, aceptaTerminos: d.aceptaTerminos, referidoPor: d.referidoPor,
  });
});
export const cambiarUsername = onCall((req) => cuenta.cambiarUsername(uidDe(req), { username: datos(req).username }));
export const guardarAjustes = onCall((req) => cuenta.guardarAjustes(uidDe(req), { ajustes: datos(req).ajustes }));

// Juego
export const empezarPregunta = onCall((req) => juego.empezarPregunta(uidDe(req), { postId: id(datos(req).postId) }));
export const responder = onCall((req) => {
  const d = datos(req);
  return juego.responder(uidDe(req), { postId: id(d.postId), opcion: typeof d.opcion === "number" ? d.opcion : -1 });
});
export const pagarRespuesta = onCall((req) => juego.pagarRespuesta(uidDe(req), { postId: id(datos(req).postId) }));

// Publicaciones
export const crearPublicacion = onCall((req) => {
  const d = datos(req);
  return publicaciones.crearPublicacion(uidDe(req), { tipo: d.tipo, precio: d.precio, preguntas: d.preguntas });
});
export const eliminarPublicacion = onCall((req) => publicaciones.eliminarPublicacion(uidDe(req), { postId: id(datos(req).postId) }));
export const editarPregunta = onCall((req) => {
  const d = datos(req);
  return publicaciones.editarPregunta(uidDe(req), { postId: id(d.postId), pregunta: d.pregunta });
});
export const misPreguntas = onCall((req) => publicaciones.misPreguntas(uidDe(req), { postId: id(datos(req).postId) }));
// Un solo disparador para todo el bucket: fotos/videos de publicaciones y reels.
export const procesarSubida = onObjectFinalized({ memory: "1GiB", timeoutSeconds: 300 }, (ev) =>
  reels.RUTA_REEL.test(ev.data.name)
    ? reels.procesarReel(ev.data.bucket, ev.data.name, ev.data.contentType, ev.data.metadata)
    : publicaciones.procesarSubida(ev.data.bucket, ev.data.name, ev.data.contentType, ev.data.metadata),
);

// Social
export const seguir = onCall((req) => social.seguir(uidDe(req), { creadorId: id(datos(req).creadorId) }));
export const dejarDeSeguir = onCall((req) => social.dejarDeSeguir(uidDe(req), { creadorId: id(datos(req).creadorId) }));
export const darMeGusta = onCall((req) => {
  const d = datos(req);
  return social.darMeGusta(uidDe(req), { postId: id(d.postId), valor: d.valor !== false });
});
export const comentar = onCall((req) => {
  const d = datos(req);
  return social.comentar(uidDe(req), { postId: id(d.postId), texto: d.texto, respondeA: d.respondeA ? id(d.respondeA, "el comentario") : undefined });
});
export const reportar = onCall((req) => {
  const d = datos(req);
  return social.reportar(uidDe(req), { postId: id(d.postId), motivo: d.motivo, detalle: d.detalle });
});

// Reels
export const crearReel = onCall((req) => reels.crearReel(uidDe(req), { texto: datos(req).texto }));
export const editarReel = onCall((req) => {
  const d = datos(req);
  return reels.editarReel(uidDe(req), { reelId: id(d.reelId), texto: d.texto });
});
export const eliminarReel = onCall((req) => reels.eliminarReel(uidDe(req), { reelId: id(datos(req).reelId) }));
export const meGustaReel = onCall((req) => {
  const d = datos(req);
  return reels.meGustaReel(uidDe(req), { reelId: id(d.reelId), valor: d.valor !== false });
});
export const comentarReel = onCall((req) => {
  const d = datos(req);
  return reels.comentarReel(uidDe(req), { reelId: id(d.reelId), texto: d.texto, respondeA: d.respondeA ? id(d.respondeA, "el comentario") : undefined });
});

// Escaparate público de la página de descarga (vía Hosting en /api/escaparate):
// las tarjetas del feed de los creadores más populares.
export const escaparatePublico = onRequest({ invoker: "public", maxInstances: 5 }, async (_req, res) => {
  const tarjetas = await escaparate.populares();
  res.set("Cache-Control", "public, max-age=300, s-maxage=600").json({ tarjetas });
});

// Seguridad y cuenta
export const bloquear = onCall((req) => {
  const d = datos(req);
  return seguridad.bloquear(uidDe(req), { otroId: id(d.otroId, "el usuario"), valor: d.valor !== false });
});
export const reportarReel = onCall((req) => {
  const d = datos(req);
  return seguridad.reportarReel(uidDe(req), { reelId: id(d.reelId), motivo: d.motivo, detalle: d.detalle });
});
export const reportarProblema = onCall((req) => seguridad.reportarProblema(uidDe(req), { texto: datos(req).texto }));
export const eliminarCuenta = onCall({ timeoutSeconds: 300 }, (req) => seguridad.eliminarCuenta(uidDe(req)));

// Notificaciones
export const registrarDispositivo = onCall((req) => notificaciones.registrarDispositivo(uidDe(req), { token: datos(req).token }));
export const borrarDispositivo = onCall((req) => notificaciones.borrarDispositivo(uidDe(req), { token: datos(req).token }));
export const marcarLeidas = onCall((req) => notificaciones.marcarLeidas(uidDe(req)));
export const avisarVidas = onSchedule({ schedule: "every 15 minutes", timeZone: "America/New_York" }, async () => {
  await notificaciones.avisarVidasDevueltas();
});

// Compra de monedas con Stripe (la clave secreta vive en Secret Manager: STRIPE_SECRET).
const STRIPE_SECRET = defineSecret("STRIPE_SECRET");
export const crearPago = onCall({ secrets: [STRIPE_SECRET] }, (req) => {
  const d = datos(req);
  return pagos.crearPago(STRIPE_SECRET.value(), uidDe(req), req.auth?.token.email ?? null, { paquete: d.paquete, origen: d.origen });
});
export const confirmarPagos = onCall({ secrets: [STRIPE_SECRET] }, (req) => pagos.confirmarPagos(STRIPE_SECRET.value(), uidDe(req)));
// Retiros de los creadores con Stripe Connect.
export const conectarBanco = onCall({ secrets: [STRIPE_SECRET] }, (req) => {
  const d = datos(req);
  return pagos.conectarBanco(STRIPE_SECRET.value(), uidDe(req), req.auth?.token.email ?? null, { pais: d.pais, origen: d.origen });
});
export const estadoBanco = onCall({ secrets: [STRIPE_SECRET] }, (req) => pagos.estadoBanco(STRIPE_SECRET.value(), uidDe(req)));
export const retirar = onCall({ secrets: [STRIPE_SECRET] }, (req) => pagos.retirar(STRIPE_SECRET.value(), uidDe(req)));
export const liberarGanancias = onSchedule({ schedule: "every day 03:00", timeZone: "America/New_York" }, async () => {
  await pagos.liberarGanancias();
});

// Estadísticas
export const registrarVisita = onCall((req) => estadisticas.registrarVisita(uidDe(req)));
export const evento = onCall((req) => { uidDe(req); return estadisticas.eventoApp({ tipo: datos(req).tipo }); });
// Página pública de descarga (vía Hosting en /api/evento?t=visita|apk|instalar).
export const eventoPublico = onRequest({ invoker: "public", maxInstances: 5 }, async (req, res) => {
  const ok = await estadisticas.eventoPublico(req.query.t);
  res.set("Cache-Control", "no-store").status(ok ? 204 : 400).send("");
});
