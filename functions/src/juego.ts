// Lógica del juego. Todo pasa en transacciones para que nadie pueda hacer trampa.
//
// Cómo se cuentan las vidas: al empezar una pregunta se gasta la vida (y se
// cuenta el intento como fallo). Si el jugador acierta a tiempo o paga antes
// de que se acabe el tiempo, se le devuelve. Así, cerrar la app a mitad de una
// pregunta cuenta como fallo y no sirve para ver la pregunta gratis.
import { FieldValue, Timestamp, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { bloqueoHasta, db, fallo, leerPrivado, mezclar, vidasActuales, type Privado } from "./comun.js";
import { contarReferido, leerInvitador } from "./referidos.js";
import { FASE_PRUEBA, MARGEN_RESPUESTA_MS, MILESIMAS_POR_MONEDA, DIAS_EN_ESPERA, PREGUNTAS_POR_POST, VIDAS_POR_DIA, diaDe } from "./reglas.js";

type Post = {
  creadorId: string;
  orden: number | null;
  precio: number;
  tiempo: number;
  estado: string;
  oculta: boolean;
};

type Pregunta = { texto: string; opciones: string[]; correcta: number };

type Intento = {
  preguntasUsadas: number;
  ultimoDia: string | null;
  inicioEn: Timestamp | null;
  preguntaActual: number | null;
  ordenOpciones: number[] | null;
  pendiente: boolean;
};

const refs = (uid: string, postId: string, creadorId?: string) => ({
  post: db().doc(`posts/${postId}`),
  desbloqueo: db().doc(`users/${uid}/desbloqueos/${postId}`),
  intento: db().doc(`users/${uid}/intentos/${postId}`),
  privado: db().doc(`private/${uid}`),
  progreso: creadorId ? db().doc(`users/${uid}/progreso/${creadorId}`) : null,
  creador: creadorId ? db().doc(`users/${creadorId}`) : null,
});

async function leerPost(tx: Transaction, ref: DocumentReference): Promise<Post> {
  const snap = await tx.get(ref);
  if (!snap.exists) fallo("no-existe", "Esa foto no existe.", "not-found");
  return snap.data() as Post;
}

/**
 * Comprueba que el post se puede jugar: aprobado, visible, de otro creador,
 * sin desbloquear y que es el siguiente nivel de la fila (los posts ocultos se saltan).
 * Devuelve el siguienteOrden actual del jugador.
 */
async function comprobarNivel(tx: Transaction, uid: string, postId: string, post: Post): Promise<number> {
  if (post.estado !== "aprobada" || post.oculta || post.orden === null) fallo("no-disponible", "Esta foto no está disponible.");
  if (post.creadorId === uid) fallo("es-tuya", "No puedes jugar tus propias fotos.");
  const r = refs(uid, postId, post.creadorId);
  const [desb, prog] = await Promise.all([tx.get(r.desbloqueo), tx.get(r.progreso!)]);
  if (desb.exists) fallo("ya-desbloqueada", "Ya desbloqueaste esta foto.");
  const siguiente: number = prog.exists ? (prog.get("siguienteOrden") ?? 0) : 0;
  if (post.orden > siguiente) {
    const antes = await tx.get(
      db().collection("posts")
        .where("creadorId", "==", post.creadorId)
        .where("estado", "==", "aprobada")
        .where("oculta", "==", false)
        .where("orden", ">=", siguiente)
        .where("orden", "<", post.orden)
        .limit(1),
    );
    if (!antes.empty) fallo("nivel-bloqueado", "Primero desbloquea las fotos anteriores de este creador.");
  }
  return siguiente;
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

function desbloquear(tx: Transaction, uid: string, postId: string, post: Post, siguiente: number, via: "acierto" | "pago", ahora: Date) {
  const r = refs(uid, postId, post.creadorId);
  tx.set(r.desbloqueo, { creadorId: post.creadorId, orden: post.orden, via, monedas: via === "pago" ? post.precio : 0, creadoEn: Timestamp.fromDate(ahora) });
  tx.set(r.progreso!, { siguienteOrden: Math.max(siguiente, post.orden! + 1), actualizadoEn: Timestamp.fromDate(ahora) }, { merge: true });
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
    await comprobarNivel(tx, uid, postId, post);
    const [privado, intentoSnap] = await Promise.all([leerPrivado(tx, uid), tx.get(r.intento)]);
    const invitador = await leerInvitador(tx, privado);
    const intento: Intento = intentoSnap.exists ? { ...intentoVacio(), ...(intentoSnap.data() as Intento) } : intentoVacio();
    const hoy = diaDe(ahora);

    // Si volvió a abrir la pregunta y aún le queda tiempo, se le devuelve la misma.
    if (intento.pendiente && ahora.getTime() < venceEn(intento, post)) {
      const p = (await tx.get(r.post.collection("preguntas").doc(String(intento.preguntaActual)))).data() as Pregunta;
      return {
        pregunta: p.texto,
        opciones: intento.ordenOpciones!.map((i) => p.opciones[i]),
        numero: intento.preguntaActual! + 1,
        tiempo: post.tiempo,
        venceEn: venceEn(intento, post),
        vidas: vidasActuales(privado, ahora).vidas,
      };
    }

    if (intento.preguntasUsadas >= PREGUNTAS_POR_POST) fallo("sin-preguntas", "Ya usaste tu intento en esta foto. Ahora solo puedes verla pagando.");
    if (intento.ultimoDia === hoy) fallo("ya-intentaste-hoy", "Ya intentaste esta foto hoy. Mañana tendrás otra pregunta.");

    const v = vidasActuales(privado, ahora);
    if (v.vidas <= 0) fallo("sin-vidas", "Te quedaste sin vidas.");

    const n = intento.preguntasUsadas;
    const preguntaSnap = await tx.get(r.post.collection("preguntas").doc(String(n)));
    if (!preguntaSnap.exists) fallo("no-disponible", "Esta foto no tiene preguntas.");
    const p = preguntaSnap.data() as Pregunta;
    const orden = mezclar([0, 1, 2], aleatorio);
    const vidas = v.vidas - 1;

    tx.set(r.intento, {
      creadorId: post.creadorId,
      preguntasUsadas: n + 1,
      ultimoDia: hoy,
      inicioEn: Timestamp.fromDate(ahora),
      preguntaActual: n,
      ordenOpciones: orden,
      pendiente: true,
      resultado: null,
    });
    tx.update(r.privado, { vidas, vidasDia: hoy, vidasVuelvenEn: vidas === 0 ? bloqueoHasta(ahora) : v.vidasVuelvenEn });
    tx.update(r.post, { intentos: FieldValue.increment(1), fallos: FieldValue.increment(1) });
    tx.update(db().doc(`users/${post.creadorId}`), { totalIntentos: FieldValue.increment(1), totalFallos: FieldValue.increment(1) });
    // Su primera foto jugada: si vino invitado, la invitación cuenta ahora.
    contarReferido(tx, uid, invitador, ahora);

    return {
      pregunta: p.texto,
      opciones: orden.map((i) => p.opciones[i]),
      numero: n + 1,
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
  preguntasRestantes: number;
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
    const [preguntaSnap, privado, prog] = await Promise.all([
      tx.get(r.post.collection("preguntas").doc(String(intento.preguntaActual))),
      leerPrivado(tx, uid),
      tx.get(rp.progreso!),
    ]);
    const p = preguntaSnap.data() as Pregunta;
    const aTiempo = ahora.getTime() <= venceEn(intento, post);
    const elegida = Number.isInteger(opcion) && opcion >= 0 && opcion < 3 ? intento.ordenOpciones![opcion] : -1;
    const correcta = aTiempo && elegida === p.correcta;

    tx.update(r.intento, { pendiente: false, resultado: correcta ? "acierto" : aTiempo ? "fallo" : "tiempo" });
    const restantes = PREGUNTAS_POR_POST - intento.preguntasUsadas;

    if (!correcta) {
      // La vida ya se gastó al empezar.
      const v = vidasActuales(privado, ahora);
      return {
        correcta: false,
        motivo: aTiempo && elegida >= 0 ? "incorrecta" : "tiempo",
        vidas: v.vidas,
        vidasVuelvenEn: v.vidasVuelvenEn?.toMillis() ?? null,
        preguntasRestantes: restantes,
      };
    }

    const siguiente: number = prog.exists ? (prog.get("siguienteOrden") ?? 0) : 0;
    const v = devolverVida(privado, ahora);
    tx.update(r.privado, { vidas: v.vidas, vidasVuelvenEn: v.vidasVuelvenEn });
    desbloquear(tx, uid, postId, post, siguiente, "acierto", ahora);
    tx.update(r.post, { desbloqueos: FieldValue.increment(1), fallos: FieldValue.increment(-1) });
    tx.update(db().doc(`users/${post.creadorId}`), { totalDesbloqueos: FieldValue.increment(1), totalFallos: FieldValue.increment(-1) });
    return { correcta: true, motivo: null, vidas: v.vidas, vidasVuelvenEn: null, preguntasRestantes: restantes };
  });
}

// ---------------------------------------------------------------------------

export type RespuestaPagar = { respuesta: string; pregunta: string; monedas: number };

export async function pagarRespuesta(uid: string, datos: { postId: string }, ahora = new Date()): Promise<RespuestaPagar> {
  const { postId } = datos;
  return db().runTransaction(async (tx) => {
    const r = refs(uid, postId);
    const post = await leerPost(tx, r.post);
    const siguiente = await comprobarNivel(tx, uid, postId, post);
    const [privado, intentoSnap] = await Promise.all([leerPrivado(tx, uid), tx.get(r.intento)]);
    const invitador = await leerInvitador(tx, privado);
    const intento: Intento = intentoSnap.exists ? { ...intentoVacio(), ...(intentoSnap.data() as Intento) } : intentoVacio();

    if (privado.monedas < post.precio) fallo("sin-monedas", `Te faltan ${post.precio - privado.monedas} monedas.`);

    // Se muestra la respuesta de la pregunta abierta, o la de la última que le salió
    // (la que acaba de fallar). Si nunca jugó esta foto, la del creador.
    const n = intento.pendiente ? intento.preguntaActual! : Math.max(0, intento.preguntasUsadas - 1);
    const p = (await tx.get(r.post.collection("preguntas").doc(String(n)))).data() as Pregunta;

    // Primero se gastan las monedas de regalo; solo las compradas le pagan al creador.
    const regalo = Math.min(privado.monedasRegalo ?? 0, post.precio);
    const pagadas = post.precio - regalo;
    const monedas = privado.monedas - post.precio;
    const cambiosPrivado: Record<string, unknown> = { monedas, monedasRegalo: (privado.monedasRegalo ?? 0) - regalo };
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
    desbloquear(tx, uid, postId, post, siguiente, "pago", ahora);

    tx.update(r.post, { desbloqueos: FieldValue.increment(1), monedasGastadas: FieldValue.increment(pagadas), monedasRecibidas: FieldValue.increment(post.precio) });
    if (FASE_PRUEBA) {
      // El creador acumula todas las monedas gastadas en su foto (de regalo: no se pueden retirar).
      tx.update(db().doc(`private/${post.creadorId}`), {
        monedas: FieldValue.increment(post.precio),
        monedasRegalo: FieldValue.increment(post.precio),
        monedasGanadas: FieldValue.increment(post.precio),
      });
    }
    tx.update(db().doc(`users/${post.creadorId}`), { totalDesbloqueos: FieldValue.increment(1) });
    if (pagadas > 0) {
      const milesimas = pagadas * MILESIMAS_POR_MONEDA;
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

    contarReferido(tx, uid, invitador, ahora);
    return { respuesta: p.opciones[p.correcta], pregunta: p.texto, monedas };
  });
}
