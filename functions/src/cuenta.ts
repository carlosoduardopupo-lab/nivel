import { Timestamp } from "firebase-admin/firestore";
import { db, fallo, texto } from "./comun.js";
import { contar } from "./estadisticas.js";
import { EDAD_MINIMA, INTERESES, MAX_INTERESES, MONEDAS_BIENVENIDA, USERNAME_RE, VIDAS_POR_DIA, edadDe } from "./reglas.js";

export const AJUSTES_POR_DEFECTO = {
  nuevas: true,
  vidas: true,
  ganancias: true,
  comentarios: false,
  comentar: true,
  sugeridos: true,
  // Salir con mi foto nítida en el escaparate público de /descargar (si estoy entre los populares).
  escaparate: true,
};

function normalizarUsername(v: unknown): string {
  const u = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (u.length < 3) fallo("username-invalido", "Mínimo 3 caracteres.", "invalid-argument");
  if (u.length > 20) fallo("username-invalido", "Máximo 20 caracteres.", "invalid-argument");
  if (!USERNAME_RE.test(u)) fallo("username-invalido", "Solo letras, números y guion bajo.", "invalid-argument");
  return u;
}

const RESERVADOS = new Set(["admin", "nivel", "blurry", "soporte", "moderador", "root"]);

export function validarIntereses(v: unknown): string[] {
  if (!Array.isArray(v)) fallo("dato-invalido", "Elige tus intereses.", "invalid-argument");
  const lista = [...new Set(v.filter((x): x is string => typeof x === "string" && INTERESES.includes(x)))];
  if (lista.length < 3) fallo("dato-invalido", "Elige al menos 3 intereses.", "invalid-argument");
  return lista.slice(0, MAX_INTERESES);
}

export async function nombreDisponible(datos: { username: unknown }): Promise<{ disponible: boolean; mensaje: string }> {
  const u = normalizarUsername(datos.username);
  if (RESERVADOS.has(u)) return { disponible: false, mensaje: "Ese nombre ya está en uso." };
  const snap = await db().doc(`usernames/${u}`).get();
  return snap.exists ? { disponible: false, mensaje: "Ese nombre ya está en uso." } : { disponible: true, mensaje: "Disponible" };
}

export type DatosRegistro = {
  username: unknown;
  nombreReal: unknown;
  fechaNacimiento: unknown;
  intereses: unknown;
  aceptaTerminos: unknown;
  /** Nombre de usuario de quien compartió el enlace (opcional). */
  referidoPor?: unknown;
};

export async function registrar(uid: string, correo: string | null, datos: DatosRegistro, ahora = new Date()): Promise<{ username: string }> {
  const username = normalizarUsername(datos.username);
  if (RESERVADOS.has(username)) fallo("username-ocupado", "Ese nombre ya está en uso.", "already-exists");
  const nombreReal = texto(datos.nombreReal, "tu nombre", 80, 3);
  const fecha = typeof datos.fechaNacimiento === "string" ? datos.fechaNacimiento : "";
  const edad = edadDe(fecha, ahora);
  if (edad === null) fallo("fecha-invalida", "La fecha de nacimiento no es válida.", "invalid-argument");
  if (edad < EDAD_MINIMA) fallo("menor-de-edad", "Debes tener 18 años o más para usar la app.", "permission-denied");
  if (datos.aceptaTerminos !== true) fallo("terminos", "Debes aceptar los términos.", "invalid-argument");
  const intereses = validarIntereses(datos.intereses);

  await db().runTransaction(async (tx) => {
    const refUser = db().doc(`users/${uid}`);
    const refNombre = db().doc(`usernames/${username}`);
    const ref = typeof datos.referidoPor === "string" ? datos.referidoPor.trim().toLowerCase().replace(/^@/, "") : "";
    const [user, nombre, invito] = await Promise.all([
      tx.get(refUser),
      tx.get(refNombre),
      ref && USERNAME_RE.test(ref) ? tx.get(db().doc(`usernames/${ref}`)) : null,
    ]);
    if (user.exists) fallo("ya-registrado", "Tu cuenta ya está registrada.", "already-exists");
    if (nombre.exists) fallo("username-ocupado", "Ese nombre ya está en uso.", "already-exists");
    // Referido: se guarda quién invitó (un código inválido o propio se ignora). Los premios
    // se dan cuando el nuevo juega su primera foto (referidos.ts).
    const invitoUid: string | null = invito?.exists && invito.get("uid") !== uid ? invito.get("uid") : null;
    const t = Timestamp.fromDate(ahora);
    tx.set(refNombre, { uid });
    tx.set(refUser, {
      username,
      avatarUrl: null,
      intereses,
      seguidores: 0,
      siguiendo: 0,
      totalMeGusta: 0,
      totalDesbloqueos: 0,
      totalIntentos: 0,
      totalFallos: 0,
      porcentajeMeGusta: null,
      porcentajeFallos: 0,
      numPublicaciones: 0,
      precioPromedio: null,
      ultimaPublicacionEn: null,
      esCreador: false,
      esVip: false,
      identidadVerificada: false,
      creadoEn: t,
    });
    tx.set(db().doc(`private/${uid}`), {
      nombreReal,
      fechaNacimiento: fecha,
      correo,
      monedas: MONEDAS_BIENVENIDA,
      monedasRegalo: MONEDAS_BIENVENIDA,
      vidas: VIDAS_POR_DIA,
      vidasVuelvenEn: null,
      vidasDia: null,
      gananciasDisponibles: 0,
      gananciasEnEspera: 0,
      stripeCuentaId: null,
      ajustes: AJUSTES_POR_DEFECTO,
      referidoPor: invitoUid,
      referidoContado: false,
      referidos: 0,
    });
    if (invitoUid) tx.set(db().doc(`private/${invitoUid}/referidos/${uid}`), { estado: "pendiente", creadoEn: t });
  });
  await contar({ registros: 1 }, ahora);
  return { username };
}

export async function cambiarUsername(uid: string, datos: { username: unknown }): Promise<{ username: string }> {
  const username = normalizarUsername(datos.username);
  if (RESERVADOS.has(username)) fallo("username-ocupado", "Ese nombre ya está en uso.", "already-exists");
  await db().runTransaction(async (tx) => {
    const refUser = db().doc(`users/${uid}`);
    const refNuevo = db().doc(`usernames/${username}`);
    const [user, nuevo] = await Promise.all([tx.get(refUser), tx.get(refNuevo)]);
    if (!user.exists) fallo("sin-perfil", "Termina tu registro primero.");
    const actual = user.get("username") as string;
    if (actual === username) return;
    if (nuevo.exists) fallo("username-ocupado", "Ese nombre ya está en uso.", "already-exists");
    tx.delete(db().doc(`usernames/${actual}`));
    tx.set(refNuevo, { uid });
    tx.update(refUser, { username });
  });
  return { username };
}

export async function guardarAjustes(uid: string, datos: { ajustes: unknown }): Promise<void> {
  const a = datos.ajustes;
  if (!a || typeof a !== "object") fallo("dato-invalido", "Ajustes no válidos.", "invalid-argument");
  const limpio: Record<string, boolean> = {};
  for (const k of Object.keys(AJUSTES_POR_DEFECTO)) {
    const v = (a as Record<string, unknown>)[k];
    if (typeof v === "boolean") limpio[`ajustes.${k}`] = v;
  }
  if (!Object.keys(limpio).length) return;
  await db().doc(`private/${uid}`).update(limpio);
}
