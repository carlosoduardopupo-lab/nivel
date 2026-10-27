// Pruebas de la lógica del juego contra el emulador de Firestore.
// Se ejecutan con `npm test` desde la raíz (arranca el emulador solo).
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { empezarPregunta, pagarRespuesta, responder } from "../src/juego.js";
import { registrar } from "../src/cuenta.js";
import { comentar } from "../src/social.js";
import { comentarReel, crearReel, editarReel, eliminarReel, meGustaReel } from "../src/reels.js";
import { aprobarPublicacion } from "../src/moderacion.js";
import { editarPregunta, eliminarPublicacion, misPreguntas } from "../src/publicaciones.js";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
const PROYECTO = "demo-nivel-pruebas";
initializeApp({ projectId: PROYECTO });
const db = getFirestore();

const JUGADOR = "jugador";
const CREADOR = "creador";
const T0 = new Date("2026-10-27T15:00:00Z"); // 11:00 en Nueva York
const seg = (s: number) => new Date(T0.getTime() + s * 1000);
const dias = (d: number) => new Date(T0.getTime() + d * 86_400_000);
const sinAzar = () => 0.999; // con este valor el orden mezclado es [0, 1, 2]

async function codigo(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof HttpsError) return (e.details as { codigo: string }).codigo;
    throw e;
  }
  return "sin-error";
}

const privado = async (uid = JUGADOR) => (await db.doc(`private/${uid}`).get()).data()!;

async function preparar({ monedas = 10, vidas = 3 } = {}) {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: "DELETE" });
  const b = db.batch();
  for (const uid of [JUGADOR, CREADOR]) {
    b.set(db.doc(`users/${uid}`), { username: uid, totalIntentos: 0, totalFallos: 0, totalDesbloqueos: 0 });
    b.set(db.doc(`private/${uid}`), {
      monedas: uid === JUGADOR ? monedas : 0, vidas: uid === JUGADOR ? vidas : 3, vidasVuelvenEn: null, vidasDia: null,
      gananciasEnEspera: 0, gananciasDisponibles: 0,
    });
  }
  // Tres fotos del creador: precios 1, 3 y 2 (tiempos 10, 20 y 15 s).
  [1, 3, 2].forEach((precio, orden) => {
    const ref = db.doc(`posts/p${orden}`);
    b.set(ref, { creadorId: CREADOR, orden, precio, tiempo: Math.min(30, 10 + 5 * (precio - 1)), estado: "aprobada", oculta: false, intentos: 0, fallos: 0, desbloqueos: 0 });
    for (let n = 0; n < 3; n++) {
      b.set(ref.collection("preguntas").doc(String(n)), { texto: `P${orden}-${n}`, opciones: [`bien${n}`, "mal1", "mal2"], correcta: 0 });
    }
  });
  await b.commit();
}

beforeAll(async () => {
  await db.listCollections(); // falla rápido si el emulador no está encendido
});

describe("empezarPregunta", () => {
  beforeEach(() => preparar());

  it("devuelve la pregunta y las opciones sin la respuesta", async () => {
    const r = await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    expect(r).toMatchObject({ pregunta: "P0-0", numero: 1, tiempo: 10, vidas: 2 });
    expect(r.opciones).toHaveLength(3);
    expect(Object.keys(r)).not.toContain("correcta");
    const intento = (await db.doc(`users/${JUGADOR}/intentos/p0`).get()).data()!;
    expect(intento).toMatchObject({ pendiente: true, preguntaActual: 0, preguntasUsadas: 1 });
  });

  it("no deja saltarse niveles", async () => {
    expect(await codigo(empezarPregunta(JUGADOR, { postId: "p1" }, T0))).toBe("nivel-bloqueado");
  });

  it("se salta los niveles ocultos", async () => {
    await db.doc("posts/p0").update({ oculta: true });
    expect((await empezarPregunta(JUGADOR, { postId: "p1" }, T0)).pregunta).toBe("P1-0");
  });

  it("no deja jugar las fotos propias", async () => {
    expect(await codigo(empezarPregunta(CREADOR, { postId: "p0" }, T0))).toBe("es-tuya");
  });

  it("sin vidas no deja jugar", async () => {
    await db.doc(`private/${JUGADOR}`).update({ vidas: 0, vidasVuelvenEn: Timestamp.fromDate(dias(1)) });
    expect(await codigo(empezarPregunta(JUGADOR, { postId: "p0" }, T0))).toBe("sin-vidas");
  });

  it("las vidas vuelven cuando pasan las 24 horas", async () => {
    await db.doc(`private/${JUGADOR}`).update({ vidas: 0, vidasVuelvenEn: Timestamp.fromDate(seg(-1)) });
    expect((await empezarPregunta(JUGADOR, { postId: "p0" }, T0)).vidas).toBe(2);
  });

  it("si vuelve a abrir la pregunta a tiempo, recibe la misma sin gastar otra vida", async () => {
    const a = await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    const b = await empezarPregunta(JUGADOR, { postId: "p0" }, seg(5));
    expect(b.pregunta).toBe(a.pregunta);
    expect(b.opciones).toEqual(a.opciones);
    expect((await privado()).vidas).toBe(2);
  });
});

describe("responder", () => {
  beforeEach(() => preparar());

  it("acierto: desbloquea, avanza el progreso y devuelve la vida", async () => {
    const r0 = await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    const r = await responder(JUGADOR, { postId: "p0", opcion: r0.opciones.indexOf("bien0") }, seg(4));
    expect(r).toMatchObject({ correcta: true, vidas: 3 });
    expect((await db.doc(`users/${JUGADOR}/desbloqueos/p0`).get()).get("via")).toBe("acierto");
    expect((await db.doc(`users/${JUGADOR}/progreso/${CREADOR}`).get()).get("siguienteOrden")).toBe(1);
    const post = (await db.doc("posts/p0").get()).data()!;
    expect(post).toMatchObject({ intentos: 1, fallos: 0, desbloqueos: 1 });
    expect((await db.doc(`users/${CREADOR}`).get()).data()).toMatchObject({ totalIntentos: 1, totalFallos: 0, totalDesbloqueos: 1 });
    // Ya puede jugar el siguiente nivel.
    expect((await empezarPregunta(JUGADOR, { postId: "p1" }, seg(10))).pregunta).toBe("P1-0");
  });

  it("fallo: gasta una vida y cuenta el fallo", async () => {
    const r0 = await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    const r = await responder(JUGADOR, { postId: "p0", opcion: r0.opciones.indexOf("mal1") }, seg(3));
    expect(r).toMatchObject({ correcta: false, motivo: "incorrecta", vidas: 2, preguntasRestantes: 0 });
    expect((await db.doc(`users/${JUGADOR}/desbloqueos/p0`).get()).exists).toBe(false);
    expect((await db.doc("posts/p0").get()).data()).toMatchObject({ intentos: 1, fallos: 1, desbloqueos: 0 });
  });

  it("tiempo agotado: la respuesta correcta tarde cuenta como fallo", async () => {
    const r0 = await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    // 10 s de tiempo + 2 s de margen: a los 12,5 s ya no vale.
    const r = await responder(JUGADOR, { postId: "p0", opcion: r0.opciones.indexOf("bien0") }, seg(12.5));
    expect(r).toMatchObject({ correcta: false, motivo: "tiempo", vidas: 2 });
  });

  it("dentro del margen de 2 segundos todavía vale", async () => {
    const r0 = await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    expect((await responder(JUGADOR, { postId: "p0", opcion: r0.opciones.indexOf("bien0") }, seg(11.5))).correcta).toBe(true);
  });

  it("opción -1 (el cliente avisa de que se acabó el tiempo) es fallo", async () => {
    await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    expect((await responder(JUGADOR, { postId: "p0", opcion: -1 }, seg(10))).motivo).toBe("tiempo");
  });

  it("no se puede responder dos veces la misma pregunta", async () => {
    await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    await responder(JUGADOR, { postId: "p0", opcion: 1 }, seg(2));
    expect(await codigo(responder(JUGADOR, { postId: "p0", opcion: 0 }, seg(3)))).toBe("sin-pregunta");
  });

  it("una sola pregunta: tras fallarla solo queda pagar", async () => {
    await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    await responder(JUGADOR, { postId: "p0", opcion: 1 }, seg(2));
    expect(await codigo(empezarPregunta(JUGADOR, { postId: "p0" }, seg(60)))).toBe("sin-preguntas");
    expect(await codigo(empezarPregunta(JUGADOR, { postId: "p0" }, dias(1)))).toBe("sin-preguntas");
    expect((await pagarRespuesta(JUGADOR, { postId: "p0" }, dias(1))).respuesta).toBe("bien0");
  });

  it("al perder la tercera vida se bloquea 24 horas en todos los creadores", async () => {
    await db.doc(`private/${JUGADOR}`).update({ vidas: 1, vidasDia: "2026-10-27" });
    await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    const r = await responder(JUGADOR, { postId: "p0", opcion: 1 }, seg(2));
    expect(r.vidas).toBe(0);
    expect(r.vidasVuelvenEn).toBe(T0.getTime() + 86_400_000);
    // Otra foto que sí podría jugar (de otro creador) tampoco se puede.
    await db.doc("posts/otro").set({ creadorId: "otroCreador", orden: 0, precio: 1, tiempo: 10, estado: "aprobada", oculta: false });
    expect(await codigo(empezarPregunta(JUGADOR, { postId: "otro" }, seg(60)))).toBe("sin-vidas");
  });

  it("con vidas gastadas, al empezar un día nuevo vuelven las 3", async () => {
    await db.doc(`private/${JUGADOR}`).update({ vidas: 1, vidasDia: "2026-10-26" });
    expect((await empezarPregunta(JUGADOR, { postId: "p0" }, T0)).vidas).toBe(2);
  });
});

describe("pagarRespuesta", () => {
  beforeEach(() => preparar({ monedas: 10 }));

  it("descuenta monedas, desbloquea, paga al creador en espera y devuelve la respuesta", async () => {
    const r = await pagarRespuesta(JUGADOR, { postId: "p0" }, T0);
    expect(r).toMatchObject({ respuesta: "bien0", monedas: 9 });
    expect((await db.doc(`users/${JUGADOR}/desbloqueos/p0`).get()).data()).toMatchObject({ via: "pago", monedas: 1 });
    expect((await db.doc(`users/${JUGADOR}/progreso/${CREADOR}`).get()).get("siguienteOrden")).toBe(1);
    expect((await privado(CREADOR)).gananciasEnEspera).toBe(5);
    // Fase de prueba: el creador acumula las monedas gastadas en su foto.
    expect(await privado(CREADOR)).toMatchObject({ monedas: 1, monedasRegalo: 1, monedasGanadas: 1 });
    expect((await db.doc("posts/p0").get()).get("monedasRecibidas")).toBe(1);
    const g = await db.collection(`private/${CREADOR}/ganancias`).get();
    expect(g.size).toBe(1);
    expect(g.docs[0].get("liberaEn").toMillis()).toBe(dias(7).getTime());
    expect((await db.doc("posts/p0").get()).get("desbloqueos")).toBe(1);
  });

  it("las monedas de regalo se gastan primero y no le pagan al creador", async () => {
    await db.doc(`private/${JUGADOR}`).update({ monedas: 10, monedasRegalo: 1 });
    await db.doc("posts/p0").update({ precio: 3 });
    expect((await pagarRespuesta(JUGADOR, { postId: "p0" }, T0)).monedas).toBe(7);
    expect((await privado()).monedasRegalo).toBe(0);
    expect((await privado(CREADOR)).gananciasEnEspera).toBe(10);
    expect((await db.doc("posts/p0").get()).get("monedasGastadas")).toBe(2);
  });

  it("si todo es regalo, el creador no recibe dinero (solo las monedas de prueba)", async () => {
    await db.doc(`private/${JUGADOR}`).update({ monedas: 100, monedasRegalo: 100 });
    await pagarRespuesta(JUGADOR, { postId: "p0" }, T0);
    expect((await privado(CREADOR)).gananciasEnEspera).toBe(0);
    expect((await privado(CREADOR)).monedasGanadas).toBe(1);
    expect((await db.collection(`private/${CREADOR}/ganancias`).get()).size).toBe(0);
  });

  it("sin monedas suficientes no deja pagar", async () => {
    await db.doc(`private/${JUGADOR}`).update({ monedas: 2 });
    await pagarRespuesta(JUGADOR, { postId: "p0" }, T0);
    expect(await codigo(pagarRespuesta(JUGADOR, { postId: "p1" }, T0))).toBe("sin-monedas");
    expect((await privado()).monedas).toBe(1);
    expect((await db.doc(`users/${JUGADOR}/desbloqueos/p1`).get()).exists).toBe(false);
  });

  it("después de fallar, la respuesta que se muestra es la de la pregunta fallada", async () => {
    await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    await responder(JUGADOR, { postId: "p0", opcion: 1 }, seg(2));
    expect((await pagarRespuesta(JUGADOR, { postId: "p0" }, seg(5))).respuesta).toBe("bien0");
  });

  it("sin vidas sí se puede pagar", async () => {
    await db.doc(`private/${JUGADOR}`).update({ vidas: 0, vidasVuelvenEn: Timestamp.fromDate(dias(1)) });
    expect((await pagarRespuesta(JUGADOR, { postId: "p0" }, T0)).respuesta).toBe("bien0");
  });

  it("pagar con la pregunta abierta devuelve la vida y no cuenta el fallo", async () => {
    await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    expect((await privado()).vidas).toBe(2);
    await pagarRespuesta(JUGADOR, { postId: "p0" }, seg(3));
    expect((await privado()).vidas).toBe(3);
    expect((await db.doc("posts/p0").get()).data()).toMatchObject({ intentos: 1, fallos: 0 });
    expect(await codigo(responder(JUGADOR, { postId: "p0", opcion: 0 }, seg(4)))).toBe("sin-pregunta");
  });

  it("no se puede pagar una foto ya desbloqueada ni saltarse niveles", async () => {
    await pagarRespuesta(JUGADOR, { postId: "p0" }, T0);
    expect(await codigo(pagarRespuesta(JUGADOR, { postId: "p0" }, T0))).toBe("ya-desbloqueada");
    expect(await codigo(pagarRespuesta(JUGADOR, { postId: "p2" }, T0))).toBe("nivel-bloqueado");
  });
});

describe("eliminarPublicacion", () => {
  beforeEach(async () => {
    await preparar();
    await db.doc(`users/${CREADOR}`).update({ numPublicaciones: 3, precioPromedio: 2 });
  });

  it("sin desbloqueos se borra del todo y la fila sigue sin ella", async () => {
    expect(await eliminarPublicacion(CREADOR, { postId: "p0" })).toEqual({ borrada: true });
    expect((await db.doc("posts/p0").get()).exists).toBe(false);
    expect((await db.collection("posts/p0/preguntas").get()).size).toBe(0);
    expect((await db.doc(`users/${CREADOR}`).get()).data()).toMatchObject({ numPublicaciones: 2, siguienteOrden: 3, precioPromedio: 3 });
    // El jugador pasa directo al siguiente nivel.
    expect((await empezarPregunta(JUGADOR, { postId: "p1" }, T0)).pregunta).toBe("P1-0");
  });

  it("quien la desbloqueó la conserva; los demás ya no pueden jugarla ni pagarla", async () => {
    await pagarRespuesta(JUGADOR, { postId: "p0" }, T0);
    expect(await eliminarPublicacion(CREADOR, { postId: "p0" })).toEqual({ borrada: false });
    expect((await db.doc("posts/p0").get()).get("estado")).toBe("eliminada");
    expect((await db.doc(`users/${JUGADOR}/desbloqueos/p0`).get()).exists).toBe(true);
    await db.doc("private/otro").set({ monedas: 10, vidas: 3, vidasVuelvenEn: null, vidasDia: null, gananciasEnEspera: 0, gananciasDisponibles: 0 });
    expect(await codigo(pagarRespuesta("otro", { postId: "p0" }, T0))).toBe("no-disponible");
    expect(await codigo(eliminarPublicacion(CREADOR, { postId: "p0" }))).toBe("no-existe");
  });

  it("solo el creador puede eliminarla", async () => {
    expect(await codigo(eliminarPublicacion(JUGADOR, { postId: "p0" }))).toBe("no-existe");
    expect((await db.doc("posts/p0").get()).exists).toBe(true);
  });

  it("la siguiente que se apruebe no repite el número de nivel", async () => {
    await eliminarPublicacion(CREADOR, { postId: "p2" });
    await db.doc("posts/nueva").set({ creadorId: CREADOR, precio: 5, estado: "revision", oculta: false });
    expect((await aprobarPublicacion("nueva")).orden).toBe(3);
    expect((await db.doc(`users/${CREADOR}`).get()).data()).toMatchObject({ numPublicaciones: 3, siguienteOrden: 4, precioPromedio: 3 });
  });
});

describe("editarPregunta", () => {
  beforeEach(() => preparar());
  const nueva = { texto: "¿De dónde soy?", correcta: "Cuba", falsas: ["Chile", "Perú"] };

  it("el creador cambia la pregunta y los jugadores reciben la nueva", async () => {
    await editarPregunta(CREADOR, { postId: "p0", pregunta: nueva });
    expect((await misPreguntas(CREADOR, { postId: "p0" })).preguntas[0]).toMatchObject({ texto: "¿De dónde soy?", respuesta: "Cuba", falsas: ["Chile", "Perú"] });
    const r0 = await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    expect(r0.pregunta).toBe("¿De dónde soy?");
    expect((await responder(JUGADOR, { postId: "p0", opcion: r0.opciones.indexOf("Cuba") }, seg(2))).correcta).toBe(true);
  });

  it("valida la pregunta y solo deja al creador", async () => {
    expect(await codigo(editarPregunta(CREADOR, { postId: "p0", pregunta: { ...nueva, falsas: ["Cuba", "Perú"] } }))).toBe("respuestas-repetidas");
    expect(await codigo(editarPregunta(JUGADOR, { postId: "p0", pregunta: nueva }))).toBe("no-existe");
  });
});

describe("registrar con referido", () => {
  beforeEach(async () => {
    await preparar({ monedas: 0 });
    await db.doc("usernames/jugador").set({ uid: JUGADOR });
    await db.doc(`private/${JUGADOR}`).update({ referidos: 0 });
  });
  const datos = (referidoPor?: string) => ({
    username: "nuevo1", nombreReal: "Ana Pérez", fechaNacimiento: "1995-04-02", aceptaTerminos: true,
    intereses: ["Viajes", "Comida", "Autos"], referidoPor,
  });

  // El amigo "juega su primera foto": empieza la pregunta de p0 (del creador de prueba).
  const jugarPrimera = (uid: string, cuando = T0) => empezarPregunta(uid, { postId: "p0" }, cuando, sinAzar);

  it("al registrarse queda pendiente; cuenta cuando el amigo juega su primera foto", async () => {
    await db.doc(`private/${JUGADOR}`).update({ vidas: 0, vidasVuelvenEn: Timestamp.fromDate(dias(1)), vidasDia: "2026-10-27" });
    await registrar("nuevo", "a@b.c", datos("@Jugador"), T0);
    expect(await privado()).toMatchObject({ referidos: 0, vidas: 0 });
    expect((await db.doc(`private/${JUGADOR}/referidos/nuevo`).get()).get("estado")).toBe("pendiente");
    expect(await privado("nuevo")).toMatchObject({ monedas: 100, monedasRegalo: 100, referidoPor: JUGADOR, referidoContado: false });

    await jugarPrimera("nuevo");
    expect(await privado()).toMatchObject({ referidos: 1, vidas: 3, vidasVuelvenEn: null });
    expect((await db.doc(`private/${JUGADOR}/referidos/nuevo`).get()).get("estado")).toBe("contado");
    expect((await privado("nuevo")).referidoContado).toBe(true);
  });

  it("pagar la primera foto también cuenta, y solo una vez", async () => {
    await registrar("nuevo", "a@b.c", datos("jugador"), T0);
    await pagarRespuesta("nuevo", { postId: "p0" }, T0);
    await pagarRespuesta("nuevo", { postId: "p1" }, T0);
    expect((await privado()).referidos).toBe(1);
  });

  it("un enlace con un usuario que no existe no da nada", async () => {
    await registrar("nuevo", "a@b.c", datos("nadie"), T0);
    await jugarPrimera("nuevo");
    expect(await privado()).toMatchObject({ monedas: 0, referidos: 0 });
    expect((await privado("nuevo")).referidoPor).toBeNull();
  });

  it("la recarga de vidas es como máximo una al día; al tercer amigo, 500 monedas", async () => {
    for (const [i, total] of [[1, 0], [2, 0], [3, 500]] as const) {
      await db.doc(`private/${JUGADOR}`).update({ vidas: 1 });
      await registrar(`n${i}`, "a@b.c", { ...datos("jugador"), username: `nuevo_${i}` }, T0);
      await jugarPrimera(`n${i}`);
      // Solo el primero del día recarga las vidas.
      expect(await privado()).toMatchObject({ monedas: total, monedasReferidos: total, referidos: i, vidas: i === 1 ? 3 : 1 });
    }
    // Al día siguiente, el cuarto amigo vuelve a recargar (y ya no da monedas).
    await db.doc(`private/${JUGADOR}`).update({ vidas: 1, vidasDia: "2026-10-28" });
    await registrar("n4", "a@b.c", { ...datos("jugador"), username: "nuevo_4" }, dias(1));
    await jugarPrimera("n4", dias(1));
    expect(await privado()).toMatchObject({ monedas: 500, monedasReferidos: 500, referidos: 4, vidas: 3 });
  });
});

describe("comentar y responder", () => {
  beforeEach(async () => {
    await preparar();
    await pagarRespuesta(JUGADOR, { postId: "p0" }, T0);
  });

  it("una respuesta a una respuesta cuelga del comentario principal", async () => {
    const { id: c1 } = await comentar(JUGADOR, { postId: "p0", texto: "¡Qué foto!" });
    const { id: r1 } = await comentar(CREADOR, { postId: "p0", texto: "Gracias", respondeA: c1 });
    const { id: r2 } = await comentar(JUGADOR, { postId: "p0", texto: "De nada", respondeA: r1 });
    expect((await db.doc(`posts/p0/comentarios/${r1}`).get()).data()).toMatchObject({ respondeA: c1, respondeAUsername: JUGADOR });
    expect((await db.doc(`posts/p0/comentarios/${r2}`).get()).data()).toMatchObject({ respondeA: c1, respondeAUsername: CREADOR });
    expect((await db.doc("posts/p0").get()).get("comentarios")).toBe(3);
  });

  it("no se responde a un comentario que no existe", async () => {
    expect(await codigo(comentar(JUGADOR, { postId: "p0", texto: "hola", respondeA: "nada" }))).toBe("no-existe");
  });
});

describe("reels", () => {
  beforeEach(() => preparar());

  it("crear deja el reel subiendo con su ruta; solo el autor lo edita", async () => {
    const { reelId, ruta } = await crearReel(CREADOR, { texto: "  Juega conmigo  " }, T0);
    expect(ruta).toBe(`reels/${CREADOR}/${reelId}`);
    expect((await db.doc(`reels/${reelId}`).get()).data()).toMatchObject({ autorId: CREADOR, texto: "Juega conmigo", estado: "subiendo", meGusta: 0 });
    await editarReel(CREADOR, { reelId, texto: "Nuevo texto" });
    expect((await db.doc(`reels/${reelId}`).get()).get("texto")).toBe("Nuevo texto");
    expect(await codigo(editarReel(JUGADOR, { reelId, texto: "hackeo" }))).toBe("no-existe");
    expect(await codigo(crearReel(CREADOR, { texto: "x".repeat(151) }))).toBe("dato-invalido");
  });

  it("me gusta solo en reels publicados, sin contar dos veces", async () => {
    await db.doc("reels/r1").set({ autorId: CREADOR, estado: "publicado", meGusta: 0, rutaVideo: null, rutaPortada: null });
    await meGustaReel(JUGADOR, { reelId: "r1", valor: true });
    await meGustaReel(JUGADOR, { reelId: "r1", valor: true });
    expect((await db.doc("reels/r1").get()).get("meGusta")).toBe(1);
    await meGustaReel(JUGADOR, { reelId: "r1", valor: false });
    expect((await db.doc("reels/r1").get()).get("meGusta")).toBe(0);
    await db.doc("reels/r2").set({ autorId: CREADOR, estado: "subiendo", meGusta: 0 });
    expect(await codigo(meGustaReel(JUGADOR, { reelId: "r2", valor: true }))).toBe("no-existe");
  });

  it("el autor lo elimina; otro no", async () => {
    await db.doc("reels/r1").set({ autorId: CREADOR, estado: "publicado", meGusta: 0, rutaVideo: null, rutaPortada: null });
    expect(await codigo(eliminarReel(JUGADOR, { reelId: "r1" }))).toBe("no-existe");
    await eliminarReel(CREADOR, { reelId: "r1" });
    expect((await db.doc("reels/r1").get()).exists).toBe(false);
  });

  it("cualquiera comenta y responde en un reel publicado", async () => {
    await db.doc("reels/r1").set({ autorId: CREADOR, estado: "publicado", meGusta: 0, comentarios: 0 });
    const { id: c1 } = await comentarReel(JUGADOR, { reelId: "r1", texto: "¡Voy a jugar!" });
    const { id: r1 } = await comentarReel(CREADOR, { reelId: "r1", texto: "¡Suerte!", respondeA: c1 });
    expect((await db.doc(`reels/r1/comentarios/${r1}`).get()).data()).toMatchObject({ respondeA: c1, respondeAUsername: JUGADOR });
    expect((await db.doc("reels/r1").get()).get("comentarios")).toBe(2);
    await db.doc("reels/r2").set({ autorId: CREADOR, estado: "subiendo" });
    expect(await codigo(comentarReel(JUGADOR, { reelId: "r2", texto: "hola" }))).toBe("no-existe");
  });
});
