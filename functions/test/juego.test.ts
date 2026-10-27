// Pruebas de la lógica del juego contra el emulador de Firestore.
// Se ejecutan con `npm test` desde la raíz (arranca el emulador solo).
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registrar } from "../src/cuenta.js";
import { empezarPregunta, pagarRespuesta, responder } from "../src/juego.js";

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

async function preparar({ monedas = 10, vidas = 3, regalo = 0 } = {}) {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: "DELETE" });
  const b = db.batch();
  for (const uid of [JUGADOR, CREADOR]) {
    b.set(db.doc(`users/${uid}`), { username: uid, totalIntentos: 0, totalFallos: 0, totalDesbloqueos: 0 });
    b.set(db.doc(`private/${uid}`), {
      monedas: uid === JUGADOR ? monedas : 0, monedasRegalo: uid === JUGADOR ? regalo : 0, vidas: uid === JUGADOR ? vidas : 3, vidasVuelvenEn: null, vidasDia: null,
      gananciasEnEspera: 0, gananciasDisponibles: 0,
    });
  }
  // Tres fotos del creador: precios 1, 3 y 2 (tiempos 10, 20 y 15 s).
  [1, 3, 2].forEach((precio, orden) => {
    const ref = db.doc(`posts/p${orden}`);
    b.set(ref, { creadorId: CREADOR, orden, precio, tiempo: Math.min(30, 10 + 5 * (precio - 1)), estado: "aprobada", oculta: false, intentos: 0, fallos: 0, desbloqueos: 0 });
    b.set(ref.collection("preguntas").doc("0"), { texto: `P${orden}`, opciones: [`bien${orden}`, "mal1", "mal2"], correcta: 0 });
  });
  // Banco de preguntas generales.
  ["B0", "B1"].forEach((t, i) => b.set(db.doc(`bancoPreguntas/${t}`), { texto: t, opciones: [`bien${t}`, "mal1", "mal2"], correcta: 0, activa: true, aleatorio: 0.2 + i * 0.5 }));
  await b.commit();
}

beforeAll(async () => {
  await db.listCollections(); // falla rápido si el emulador no está encendido
});

describe("empezarPregunta", () => {
  beforeEach(() => preparar());

  it("devuelve la pregunta y las opciones sin la respuesta", async () => {
    const r = await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    expect(r).toMatchObject({ pregunta: "P0", numero: 1, tiempo: 10, vidas: 2 });
    expect(r.opciones).toHaveLength(3);
    expect(Object.keys(r)).not.toContain("correcta");
    const intento = (await db.doc(`users/${JUGADOR}/intentos/p0`).get()).data()!;
    expect(intento).toMatchObject({ pendiente: true, preguntaActual: "p:p0", preguntasUsadas: 1 });
  });

  it("no deja saltarse niveles", async () => {
    expect(await codigo(empezarPregunta(JUGADOR, { postId: "p1" }, T0))).toBe("nivel-bloqueado");
  });

  it("se salta los niveles ocultos", async () => {
    await db.doc("posts/p0").update({ oculta: true });
    expect((await empezarPregunta(JUGADOR, { postId: "p1" }, T0)).pregunta).toBe("P1");
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
    expect((await empezarPregunta(JUGADOR, { postId: "p1" }, seg(10))).pregunta).toBe("P1");
  });

  it("fallo: gasta una vida y cuenta el fallo", async () => {
    const r0 = await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    const r = await responder(JUGADOR, { postId: "p0", opcion: r0.opciones.indexOf("mal1") }, seg(3));
    expect(r).toMatchObject({ correcta: false, motivo: "incorrecta", vidas: 2 });
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

  it("intento repetido el mismo día: no deja", async () => {
    await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    await responder(JUGADOR, { postId: "p0", opcion: 1 }, seg(2));
    expect(await codigo(empezarPregunta(JUGADOR, { postId: "p0" }, seg(60)))).toBe("ya-intentaste-hoy");
  });

  it("al día siguiente sale la pregunta de otra foto sin resolver, luego el banco, sin repetir nunca", async () => {
    const vistas: string[] = [];
    for (let d = 0; d < 4; d++) {
      const r0 = await empezarPregunta(JUGADOR, { postId: "p0" }, dias(d), sinAzar);
      vistas.push(r0.pregunta);
      expect(r0.numero).toBe(d + 1);
      await responder(JUGADOR, { postId: "p0", opcion: r0.opciones.indexOf("mal1") }, new Date(dias(d).getTime() + 2000));
    }
    expect(vistas[0]).toBe("P0");
    expect(vistas.slice(1, 3).sort()).toEqual(["P1", "P2"]);
    expect(vistas[3]).toMatch(/^B[01]$/);
    const ultima = await empezarPregunta(JUGADOR, { postId: "p0" }, dias(4), sinAzar);
    expect(ultima.pregunta).toMatch(/^B[01]$/);
    expect(ultima.pregunta).not.toBe(vistas[3]);
    await responder(JUGADOR, { postId: "p0", opcion: -1 }, dias(4));
    // Ya vio todas: solo queda pagar.
    expect(await codigo(empezarPregunta(JUGADOR, { postId: "p0" }, dias(5)))).toBe("sin-preguntas");
    expect((await pagarRespuesta(JUGADOR, { postId: "p0" }, dias(5))).respuesta).toBe(`bien${ultima.pregunta}`);
  });

  it("una foto cuya pregunta ya vio en otra foto usa otra pregunta", async () => {
    // Falla p0 hoy; mañana le sale P1 o P2 en p0 y acierta.
    let r0 = await empezarPregunta(JUGADOR, { postId: "p0" }, T0, sinAzar);
    await responder(JUGADOR, { postId: "p0", opcion: r0.opciones.indexOf("mal1") }, seg(2));
    r0 = await empezarPregunta(JUGADOR, { postId: "p0" }, dias(1), sinAzar);
    const prestada = r0.pregunta;
    await responder(JUGADOR, { postId: "p0", opcion: r0.opciones.indexOf(`bien${prestada.slice(1)}`) }, new Date(dias(1).getTime() + 2000));
    expect((await db.doc(`users/${JUGADOR}/desbloqueos/p0`).get()).exists).toBe(true);
    // En p1 ya no puede salir P0 (vista) ni la pregunta prestada.
    const r1 = await empezarPregunta(JUGADOR, { postId: "p1" }, dias(1), sinAzar);
    expect(["P0", prestada]).not.toContain(r1.pregunta);
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

describe("registrar", () => {
  beforeEach(() => preparar());

  it("los usuarios nuevos reciben 100 monedas de regalo y 3 vidas", async () => {
    await registrar("nuevo", "n@x.com", { username: "nuevo_1", nombreReal: "Ana Pérez", fechaNacimiento: "1999-03-10", intereses: ["Viajes", "Cine", "Arte"], aceptaTerminos: true }, T0);
    expect(await privado("nuevo")).toMatchObject({ monedas: 100, monedasRegalo: 100, vidas: 3 });
  });

  it("rechaza a menores de 18 y nombres repetidos", async () => {
    const base = { nombreReal: "Ana Pérez", intereses: ["Viajes", "Cine", "Arte"], aceptaTerminos: true };
    expect(await codigo(registrar("u1", null, { ...base, username: "joven", fechaNacimiento: "2010-01-01" }, T0))).toBe("menor-de-edad");
    await registrar("u2", null, { ...base, username: "repetido", fechaNacimiento: "1990-01-01" }, T0);
    expect(await codigo(registrar("u3", null, { ...base, username: "Repetido", fechaNacimiento: "1990-01-01" }, T0))).toBe("username-ocupado");
  });
});

describe("pagarRespuesta", () => {
  beforeEach(() => preparar({ monedas: 10 }));

  it("descuenta monedas, desbloquea, paga al creador en espera y devuelve la respuesta", async () => {
    const r = await pagarRespuesta(JUGADOR, { postId: "p0" }, T0);
    expect(r).toMatchObject({ respuesta: "bien0", monedas: 9 });
    expect((await privado()).monedasRegalo).toBe(0);
    expect((await db.doc(`users/${JUGADOR}/desbloqueos/p0`).get()).data()).toMatchObject({ via: "pago", monedas: 1 });
    expect((await db.doc(`users/${JUGADOR}/progreso/${CREADOR}`).get()).get("siguienteOrden")).toBe(1);
    expect((await privado(CREADOR)).gananciasEnEspera).toBe(5);
    const g = await db.collection(`private/${CREADOR}/ganancias`).get();
    expect(g.size).toBe(1);
    expect(g.docs[0].get("liberaEn").toMillis()).toBe(dias(7).getTime());
    expect((await db.doc("posts/p0").get()).get("desbloqueos")).toBe(1);
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

  it("las monedas de regalo desbloquean la foto pero no pagan al creador", async () => {
    await db.doc(`private/${JUGADOR}`).update({ monedas: 100, monedasRegalo: 100 });
    await pagarRespuesta(JUGADOR, { postId: "p0" }, T0);
    expect(await privado()).toMatchObject({ monedas: 99, monedasRegalo: 99 });
    expect((await db.doc(`users/${JUGADOR}/desbloqueos/p0`).get()).exists).toBe(true);
    expect((await privado(CREADOR)).gananciasEnEspera).toBe(0);
    expect((await db.collection(`private/${CREADOR}/ganancias`).get()).size).toBe(0);
    expect((await db.doc("posts/p0").get()).data()).toMatchObject({ monedasGastadas: 0, monedasRegalo: 1 });
  });

  it("si mezcla regalo y compradas, el creador cobra solo las compradas", async () => {
    await db.doc(`private/${JUGADOR}`).update({ monedas: 10, monedasRegalo: 1 });
    await pagarRespuesta(JUGADOR, { postId: "p0" }, T0); // 1 de regalo
    await pagarRespuesta(JUGADOR, { postId: "p1" }, T0); // 3 compradas
    expect(await privado()).toMatchObject({ monedas: 6, monedasRegalo: 0 });
    expect((await privado(CREADOR)).gananciasEnEspera).toBe(15);
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
