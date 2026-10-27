import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { id } from "./comun.js";
import * as cuenta from "./cuenta.js";
import * as juego from "./juego.js";
import * as publicaciones from "./publicaciones.js";
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
    username: d.username, nombreReal: d.nombreReal, fechaNacimiento: d.fechaNacimiento, intereses: d.intereses, aceptaTerminos: d.aceptaTerminos,
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
  return publicaciones.crearPublicacion(uidDe(req), { tipo: d.tipo, precio: d.precio, preguntas: d.preguntas, usarIA: d.usarIA });
});
export const misPreguntas = onCall((req) => publicaciones.misPreguntas(uidDe(req), { postId: id(datos(req).postId) }));
export const procesarSubida = onObjectFinalized({ memory: "1GiB", timeoutSeconds: 120 }, (ev) =>
  publicaciones.procesarSubida(ev.data.bucket, ev.data.name, ev.data.contentType, ev.data.metadata),
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
  return social.comentar(uidDe(req), { postId: id(d.postId), texto: d.texto });
});
export const reportar = onCall((req) => {
  const d = datos(req);
  return social.reportar(uidDe(req), { postId: id(d.postId), motivo: d.motivo, detalle: d.detalle });
});
