// Lógica del juego. Todo pasa en transacciones para que nadie pueda hacer trampa.
//
// Cómo se cuentan las vidas: al empezar una pregunta se gasta la vida (y se
// cuenta el intento como fallo). Si el jugador acierta a tiempo o paga antes
// de que se acabe el tiempo, se le devuelve. Así, cerrar la app a mitad de una
// pregunta cuenta como fallo y no sirve para ver la pregunta gratis.
//
// Qué pregunta sale: cada foto tiene una sola pregunta, la del creador. Si el
// jugador falla, al día siguiente reintenta esa foto con la pregunta de otra
// foto del mismo creador que aún no ha resuelto; si no quedan, con una del
// banco de preguntas general. Nunca se repite una pregunta que el jugador ya
// vio de ese creador (se guardan en progreso.vistas).
import { FieldValue, Timestamp, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { bloqueoHasta, db, fallo, leerPrivado, mezclar, vidasActuales, type Privado } from "./comun.js";
import { MARGEN_RESPUESTA_MS, MILESIMAS_POR_MONEDA, DIAS_EN_ESPERA, VIDAS_POR_DIA, diaDe } from "./reglas.js";

type Post = {
  creadorId: string;
  orden: number | null;
  precio: number;
  tiempo: number;
  estado: string;
  oculta: boolean;
};

type Pregunta = { texto: string; opciones: string[]; correcta: number };

/** "p:<postId>" = la pregunta de esa foto; "b:<id>" = una del banco de preguntas. */
type RefPregunta = string;

type Intento = {
  preguntasUsadas: number;
  ultimoDia: string | null;
  inicioEn: Timestamp | null;
  preguntaActual: RefPregunta | null;
  ordenOpciones: number[] | null;
  pendiente: boolean;
};

type Progreso = { siguienteOrden: number; vistas: RefPregunta[] };

const refs = (uid: string, postId: string, creadorId?: string) => ({
  post: db().doc(`posts/${postId}`),
  desbloqueo: db().doc(`users/${uid}/desbloqueos/${postId}`),
  intento: db().doc(`users/${uid}/intentos/${postId}`),
  privado: db().doc(`private/${uid}`),
  progreso: creadorId ? db().doc(`users/${uid}/progreso/${creadorId}`) : null,
});

const docPregunta = (r: RefPregunta) =>
  r.startsWith("p:") ? db().doc(`posts/${r.slice(2)}/preguntas/0`) : db().doc(`bancoPreguntas/${r.slice(2)}`);

async function leerPregunta(tx: Transaction, r: RefPregunta): Promise<Pregunta> {
  const snap = await tx.get(docPregunta(r));
  if (!snap.exists) fallo("no-disponible", "No se encontró la pregunta.");
  return snap.data() as Pregunta;
}

async function leerPost(tx: Transaction, ref: DocumentReference): Promise<Post> {
  const snap = await tx.get(ref);
  if (!snap.exists) fallo("no-existe", "Esa foto no existe.", "not-found");
  return snap.data() as Post;
}

/**
 * Comprueba que el post se puede jugar: aprobado, visible, de otro creador,
 * sin desbloquear y que es el siguiente nivel de la fila (los posts ocultos se saltan).
 * Devuelve el progreso del jugador con ese creador.
 */
async function comprobarNivel(tx: Transaction, uid: string, postId: string, post: Post): Promise<Progreso> {
  if (post.estado !== "aprobada" || post.oculta || post.orden === null) fallo("no-disponible", "Esta foto no está disponible.");
  if (post.creadorId === uid) fallo("es-tuya", "No puedes jugar tus propias fotos.");
  const r = refs(uid, postId, post.creadorId);
  const [desb, prog] = await Promise.all([tx.get(r.desbloqueo), tx.get(r.progreso!)]);
  if (desb.exists) fallo("ya-desbloqueada", "Ya desbloqueaste esta foto.");
  const progreso: Progreso = { siguienteOrden: prog.get("siguienteOrden") ?? 0, vistas: prog.get("vistas") ?? [] };
  if (post.orden > progreso.siguienteOrden) {
    const antes = await tx.get(
      db().collection("posts")
        .where("creadorId", "==", post.creadorId)
        .where("estado", "==", "aprobada")
        .where("oculta", "==", false)
        .where("orden", ">=", progreso.siguienteOrden)
        .where("orden", "<", post.orden)
        .limit(1),
    );
    if (!antes.empty) fallo("nivel-bloqueado", "Primero desbloquea las fotos anteriores de este creador.");
  }
  return progreso;
}

/** Elige una pregunta que el jugador no haya visto: la de la foto, la de otra foto sin resolver o una del banco. */
async function elegirPregunta(tx: Transaction, uid: string, postId: string, post: Post, vistas: RefPregunta[], aleatorio: () => number): Promise<RefPregunta | null> {
  const propia = `p:${postId}`;
  if (!vistas.includes(propia)) return propia;

  const [fotos, abiertas] = await Promise.all([
    tx.get(db().collection("posts").where("creadorId", "==", post.creadorId).where("estado", "==", "aprobada").where("oculta", "==", false)),
    tx.get(db().collection(`users/${uid}/desbloqueos`).where("creadorId", "==", post.creadorId)),
  ]);
  const resueltas = new Set(abiertas.docs.map((d) => d.id));
  const otras = fotos.docs.map((d) => `p:${d.id}`).filter((r) => r !== propia && !resueltas.has(r.slice(2)) && !vistas.includes(r));
  if (otras.length) return otras[Math.floor(aleatorio() * otras.length)];

  // Banco de preguntas: se elige un punto al azar y se toma la primera no vista desde ahí.
  const punto = aleatorio();
  const banco = db().collection("bancoPreguntas").where("activa", "==", true);
  for (const q of [banco.where("aleatorio", ">=", punto).orderBy("aleatorio"), banco.where("aleatorio", "<", punto).orderBy("aleatorio")]) {
    const s = await tx.get(q.limit(30));
    const libre = s.docs.map((d) => `b:${d.id}`).find((r) => !vistas.includes(r));
    if (libre) return libre;
  }
  return null;
}

function intentoVacio(): Intento {
  return { preguntasUsadas: 0, ultimoDia: null, inicioEn: null, preguntaActual: null, ordenOpciones: null, pendiente: false };
}

function venceEn(intento: Intento, post: Post): number {
  return intento.inicioEn!.toMillis() + post.tiempo * 1000 + MARGEN_RESPUESTA_MS;
}

/** Devuelve la vida gastada al empezar (al acertar o pagar a tiempo). */
function devolverVida(p: Privado, ahora: Date) {
  const v = vidasActuales(p, ahora);
  const vidas = Math.min(VIDAS_POR_DIA, v.vidas + 1);
  return { vidas, vidasVuelvenEn: vidas > 0 ? null : v.vidasVuelvenEn };
}

function desbloquear(tx: Transaction, uid: string, postId: string, post: Post, progreso: Progreso, datos: { via: "acierto" | "pago"; monedas: number; monedasRegalo: number }, ahora: Date) {
  const r = refs(uid, postId, post.creadorId);
  tx.set(r.desbloqueo, { creadorId: post.creadorId, orden: post.orden, ...datos, creadoEn: Timestamp.fromDate(ahora) });
  tx.set(r.progreso!, { siguienteOrden: Math.max(progreso.siguienteOrden, post.orden! + 1), actualizadoEn: Timestamp.fromDate(ahora) }, { merge: true });
}

// ---------------------------------------------------------------------------

export type RespuestaEmpezar = {
  pregunta: string;
  opciones: string[];
  numero: number;
  tiempo: number;
  venceEn: number;
  vidas: number;
};

export async function empezarPregunta(uid: string, datos: { postId: string }, ahora = new Date(), aleatorio = Math.random): Promise<RespuestaEmpezar> {
  const { postId } = datos;
  return db().runTransaction(async (tx) => {
    const r = refs(uid, postId);
    const post = await leerPost(tx, r.post);
    const progreso = await comprobarNivel(tx, uid, postId, post);
    const [privado, intentoSnap] = await Promise.all([leerPrivado(tx, uid), tx.get(r.intento)]);
    const intento: Intento = intentoSnap.exists ? { ...intentoVacio(), ...(intentoSnap.data() as Intento) } : intentoVacio();
    const hoy = diaDe(ahora);

    // Si volvió a abrir la pregunta y aún le queda tiempo, se le devuelve la misma.
    if (intento.pendiente && ahora.getTime() < venceEn(intento, post)) {
      const p = await leerPregunta(tx, intento.preguntaActual!);
      return {
        pregunta: p.texto,
        opciones: intento.ordenOpciones!.map((i) => p.opciones[i]),
        numero: intento.preguntasUsadas,
        tiempo: post.tiempo,
        venceEn: venceEn(intento, post),
        vidas: vidasActuales(privado, ahora).vidas,
      };
    }

    if (intento.ultimoDia === hoy) fallo("ya-intentaste-hoy", "Ya intentaste esta foto hoy. Mañana tendrás otra pregunta.");
    const v = vidasActuales(privado, ahora);
    if (v.vidas <= 0) fallo("sin-vidas", "Te quedaste sin vidas.");

    const elegida = await elegirPregunta(tx, uid, postId, post, progreso.vistas, aleatorio);
    if (!elegida) fallo("sin-preguntas", "Ya no quedan preguntas nuevas para esta foto. Puedes verla pagando.");
    const p = await leerPregunta(tx, elegida);
    const orden = mezclar([0, 1, 2], aleatorio);
    const vidas = v.vidas - 1;
    const numero = intento.preguntasUsadas + 1;

    tx.set(r.intento, {
      creadorId: post.creadorId,
      preguntasUsadas: numero,
      ultimoDia: hoy,
      inicioEn: Timestamp.fromDate(ahora),
      preguntaActual: elegida,
      ordenOpciones: orden,
      pendiente: true,
      resultado: null,
    });
    tx.set(db().doc(`users/${uid}/progreso/${post.creadorId}`), { vistas: FieldValue.arrayUnion(elegida) }, { merge: true });
    tx.update(r.privado, { vidas, vidasDia: hoy, vidasVuelvenEn: vidas === 0 ? bloqueoHasta(ahora) : v.vidasVuelvenEn });
    tx.update(r.post, { intentos: FieldValue.increment(1), fallos: FieldValue.increment(1) });
    tx.update(db().doc(`users/${post.creadorId}`), { totalIntentos: FieldValue.increment(1), totalFallos: FieldValue.increment(1) });

    return {
      pregunta: p.texto,
      opciones: orden.map((i) => p.opciones[i]),
      numero,
      tiempo: post.tiempo,
      venceEn: ahora.getTime() + post.tiempo * 1000 + MARGEN_RESPUESTA_MS,
      vidas,
    };
  });
}

// ---------------------------------------------------------------------------

export type RespuestaResponder = {
  correcta: boolean;
  motivo: "tiempo" | "incorrecta" | null;
  vidas: number;
  vidasVuelvenEn: number | null;
};

export async function responder(uid: string, datos: { postId: string; opcion: number }, ahora = new Date()): Promise<RespuestaResponder> {
  const { postId, opcion } = datos;
  return db().runTransaction(async (tx) => {
    const r = refs(uid, postId);
    const intentoSnap = await tx.get(r.intento);
    const intento = intentoSnap.data() as Intento | undefined;
    if (!intento?.pendiente) fallo("sin-pregunta", "No tienes una pregunta abierta en esta foto.");
    const post = await leerPost(tx, r.post);
    const rp = refs(uid, postId, post.creadorId);
    const [p, privado, prog] = await Promise.all([leerPregunta(tx, intento.preguntaActual!), leerPrivado(tx, uid), tx.get(rp.progreso!)]);
    const aTiempo = ahora.getTime() <= venceEn(intento, post);
    const elegida = Number.isInteger(opcion) && opcion >= 0 && opcion < 3 ? intento.ordenOpciones![opcion] : -1;
    const correcta = aTiempo && elegida === p.correcta;

    tx.update(r.intento, { pendiente: false, resultado: correcta ? "acierto" : aTiempo ? "fallo" : "tiempo" });

    if (!correcta) {
      // La vida ya se gastó al empezar.
      const v = vidasActuales(privado, ahora);
      return {
        correcta: false,
        motivo: aTiempo && elegida >= 0 ? "incorrecta" : "tiempo",
        vidas: v.vidas,
        vidasVuelvenEn: v.vidasVuelvenEn?.toMillis() ?? null,
      };
    }

    const progreso: Progreso = { siguienteOrden: prog.get("siguienteOrden") ?? 0, vistas: prog.get("vistas") ?? [] };
    const v = devolverVida(privado, ahora);
    tx.update(r.privado, { vidas: v.vidas, vidasVuelvenEn: v.vidasVuelvenEn });
    desbloquear(tx, uid, postId, post, progreso, { via: "acierto", monedas: 0, monedasRegalo: 0 }, ahora);
    tx.update(r.post, { desbloqueos: FieldValue.increment(1), fallos: FieldValue.increment(-1) });
    tx.update(db().doc(`users/${post.creadorId}`), { totalDesbloqueos: FieldValue.increment(1), totalFallos: FieldValue.increment(-1) });
    return { correcta: true, motivo: null, vidas: v.vidas, vidasVuelvenEn: null };
  });
}

// ---------------------------------------------------------------------------

export type RespuestaPagar = { respuesta: string; pregunta: string; monedas: number };

/**
 * Paga la foto con monedas. Se gastan primero las de regalo, que no generan
 * pago al creador; por cada moneda comprada el creador gana 5 milésimas.
 */
export async function pagarRespuesta(uid: string, datos: { postId: string }, ahora = new Date()): Promise<RespuestaPagar> {
  const { postId } = datos;
  return db().runTransaction(async (tx) => {
    const r = refs(uid, postId);
    const post = await leerPost(tx, r.post);
    const progreso = await comprobarNivel(tx, uid, postId, post);
    const [privado, intentoSnap] = await Promise.all([leerPrivado(tx, uid), tx.get(r.intento)]);
    const intento: Intento = intentoSnap.exists ? { ...intentoVacio(), ...(intentoSnap.data() as Intento) } : intentoVacio();

    if (privado.monedas < post.precio) fallo("sin-monedas", `Te faltan ${post.precio - privado.monedas} monedas.`);

    // Se muestra la respuesta de la pregunta abierta o de la última que le salió; si nunca jugó, la de la foto.
    const refMostrada = intento.preguntaActual ?? `p:${postId}`;
    const p = await leerPregunta(tx, refMostrada);

    const regaloDisponible = Math.min(privado.monedasRegalo ?? 0, privado.monedas);
    const deRegalo = Math.min(regaloDisponible, post.precio);
    const compradas = post.precio - deRegalo;
    const monedas = privado.monedas - post.precio;
    const cambiosPrivado: Record<string, unknown> = { monedas, monedasRegalo: regaloDisponible - deRegalo };
    if (intento.pendiente) {
      tx.update(r.intento, { pendiente: false, resultado: "pago" });
      if (ahora.getTime() <= venceEn(intento, post)) {
        // Pagó antes de que se acabara el tiempo: no cuenta como fallo.
        Object.assign(cambiosPrivado, devolverVida(privado, ahora));
        tx.update(r.post, { fallos: FieldValue.increment(-1) });
        tx.update(db().doc(`users/${post.creadorId}`), { totalFallos: FieldValue.increment(-1) });
      }
    }
    tx.update(r.privado, cambiosPrivado);
    desbloquear(tx, uid, postId, post, progreso, { via: "pago", monedas: post.precio, monedasRegalo: deRegalo }, ahora);
    // La respuesta revelada ya no puede volver a salirle.
    tx.set(db().doc(`users/${uid}/progreso/${post.creadorId}`), { vistas: FieldValue.arrayUnion(refMostrada) }, { merge: true });

    tx.update(r.post, {
      desbloqueos: FieldValue.increment(1),
      monedasGastadas: FieldValue.increment(compradas),
      monedasRegalo: FieldValue.increment(deRegalo),
    });
    tx.update(db().doc(`users/${post.creadorId}`), { totalDesbloqueos: FieldValue.increment(1) });
    if (compradas > 0) {
      const milesimas = compradas * MILESIMAS_POR_MONEDA;
      tx.update(db().doc(`private/${post.creadorId}`), { gananciasEnEspera: FieldValue.increment(milesimas) });
      tx.set(db().collection(`private/${post.creadorId}/ganancias`).doc(), {
        milesimas,
        postId,
        compradorId: uid,
        liberaEn: Timestamp.fromMillis(ahora.getTime() + DIAS_EN_ESPERA * 86_400_000),
        liberado: false,
        creadoEn: Timestamp.fromDate(ahora),
      });
    }

    return { respuesta: p.opciones[p.correcta], pregunta: p.texto, monedas };
  });
}
