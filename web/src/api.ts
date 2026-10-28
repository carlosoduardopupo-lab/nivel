import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

function llamar<D, R>(nombre: string) {
  const f = httpsCallable<D, R>(functions, nombre);
  return async (datos: D): Promise<R> => (await f(datos)).data;
}

export type Pregunta = { pregunta: string; opciones: string[]; numero: number; tiempo: number; venceEn: number; vidas: number };
export type Resultado = { correcta: boolean; motivo: "tiempo" | "incorrecta" | null; vidas: number; vidasVuelvenEn: number | null; preguntasRestantes: number };
export type PreguntaNueva = { texto: string; correcta: string; falsas: [string, string] };

export const api = {
  nombreDisponible: llamar<{ username: string }, { disponible: boolean; mensaje: string }>("nombreDisponible"),
  registrar: llamar<{ username: string; nombreReal: string; fechaNacimiento: string; intereses: string[]; aceptaTerminos: boolean; referidoPor?: string }, { username: string }>("registrar"),
  cambiarUsername: llamar<{ username: string }, { username: string }>("cambiarUsername"),
  guardarAjustes: llamar<{ ajustes: Record<string, boolean> }, void>("guardarAjustes"),
  empezarPregunta: llamar<{ postId: string }, Pregunta>("empezarPregunta"),
  responder: llamar<{ postId: string; opcion: number }, Resultado>("responder"),
  pagarRespuesta: llamar<{ postId: string }, { respuesta: string; pregunta: string; monedas: number }>("pagarRespuesta"),
  crearPublicacion: llamar<{ tipo: "foto" | "video"; precio: number; preguntas: PreguntaNueva[] }, { postId: string; ruta: string }>("crearPublicacion"),
  crearReel: llamar<{ texto: string }, { reelId: string; ruta: string }>("crearReel"),
  editarReel: llamar<{ reelId: string; texto: string }, void>("editarReel"),
  eliminarReel: llamar<{ reelId: string }, void>("eliminarReel"),
  comentarReel: llamar<{ reelId: string; texto: string; respondeA?: string }, { id: string }>("comentarReel"),
  meGustaReel: llamar<{ reelId: string; valor: boolean }, { meGusta: boolean }>("meGustaReel"),
  registrarVisita: llamar<Record<string, never>, void>("registrarVisita"),
  evento: llamar<{ tipo: "compartir" | "instalar" }, void>("evento"),
  registrarDispositivo: llamar<{ token: string }, void>("registrarDispositivo"),
  borrarDispositivo: llamar<{ token: string }, void>("borrarDispositivo"),
  crearPago: llamar<{ paquete: string; origen: string }, { url: string }>("crearPago"),
  confirmarPagos: llamar<Record<string, never>, { monedas: number }>("confirmarPagos"),
  marcarLeidas: llamar<Record<string, never>, void>("marcarLeidas"),
  bloquear: llamar<{ otroId: string; valor: boolean }, { bloqueado: boolean }>("bloquear"),
  reportarReel: llamar<{ reelId: string; motivo: string; detalle?: string }, void>("reportarReel"),
  reportarProblema: llamar<{ texto: string }, void>("reportarProblema"),
  eliminarCuenta: llamar<Record<string, never>, void>("eliminarCuenta"),
  eliminarPublicacion: llamar<{ postId: string }, { borrada: boolean }>("eliminarPublicacion"),
  editarPregunta: llamar<{ postId: string; pregunta: PreguntaNueva }, void>("editarPregunta"),
  misPreguntas: llamar<{ postId: string }, { preguntas: { texto: string; respuesta: string; falsas: string[]; autor: string }[] }>("misPreguntas"),
  seguir: llamar<{ creadorId: string }, void>("seguir"),
  dejarDeSeguir: llamar<{ creadorId: string }, void>("dejarDeSeguir"),
  darMeGusta: llamar<{ postId: string; valor: boolean }, { meGusta: boolean }>("darMeGusta"),
  comentar: llamar<{ postId: string; texto: string; respondeA?: string }, { id: string }>("comentar"),
  reportar: llamar<{ postId: string; motivo: string; detalle?: string }, void>("reportar"),
};

/** Código y mensaje legibles de un error de Cloud Functions. */
export function errorDe(e: unknown): { codigo: string; mensaje: string } {
  const x = e as { details?: { codigo?: string }; message?: string; code?: string };
  if (x?.details?.codigo) return { codigo: x.details.codigo, mensaje: x.message ?? "Algo salió mal." };
  if (x?.code === "functions/unavailable" || x?.code === "functions/internal") {
    return { codigo: "conexion", mensaje: "No hay conexión con el servidor. Inténtalo de nuevo." };
  }
  return { codigo: "desconocido", mensaje: x?.message ?? "Algo salió mal." };
}
