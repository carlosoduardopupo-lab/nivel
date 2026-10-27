import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, Timestamp, query, where, orderBy } from "firebase/firestore";
import { ref, getBytes, uploadBytes } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

const CREADOR = "creador1";
const JUGADOR = "jugador1";
const OTRO = "otro1";
const POST = "post1";
const POST_REVISION = "post2";

const img = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    // REGLAS_PROYECTO permite probar contra emuladores ya abiertos sin borrar sus datos.
    projectId: process.env.REGLAS_PROYECTO ?? "demo-nivel",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const ahora = Timestamp.now();
    for (const uid of [CREADOR, JUGADOR, OTRO]) {
      await setDoc(doc(db, "users", uid), {
        username: uid, avatarUrl: null, intereses: [], seguidores: 0, totalMeGusta: 0,
        totalDesbloqueos: 0, porcentajeFallos: 0, esVip: false, creadoEn: ahora,
      });
      await setDoc(doc(db, "private", uid), { nombreReal: "X", monedas: 50, vidas: 3, vidasVuelvenEn: null });
    }
    await setDoc(doc(db, "posts", POST), { creadorId: CREADOR, orden: 0, estado: "aprobada", oculta: false, precio: 1, meGusta: 0 });
    await setDoc(doc(db, "posts", POST_REVISION), { creadorId: CREADOR, orden: 1, estado: "revision", oculta: false, precio: 1 });
    await setDoc(doc(db, "posts", "post9"), { creadorId: CREADOR, estado: "subiendo", tipo: "foto", oculta: false });
    await setDoc(doc(db, "posts", "post10"), { creadorId: CREADOR, estado: "subiendo", tipo: "foto", oculta: false });
    await setDoc(doc(db, "posts", "post11"), { creadorId: CREADOR, estado: "subiendo", tipo: "foto", oculta: false });
    await setDoc(doc(db, "posts", "video1"), { creadorId: CREADOR, estado: "subiendo", tipo: "video", oculta: false });
    await setDoc(doc(db, "reels", "rPub"), { autorId: CREADOR, estado: "publicado", meGusta: 0 });
    await setDoc(doc(db, "reels", "rSub"), { autorId: CREADOR, estado: "subiendo", meGusta: 0 });
    await setDoc(doc(db, "posts", "eliminada"), { creadorId: CREADOR, orden: 3, estado: "eliminada", oculta: false });
    await setDoc(doc(db, "users", JUGADOR, "desbloqueos", "eliminada"), { creadorId: CREADOR, via: "pago" });
    await setDoc(doc(db, "posts", "oculto"), { creadorId: CREADOR, orden: 2, estado: "aprobada", oculta: true });
    await setDoc(doc(db, "posts", POST, "preguntas", "0"), { texto: "¿?", opciones: ["a", "b", "c"], correcta: 0 });
    await setDoc(doc(db, "posts", POST, "comentarios", "c1"), { autorId: JUGADOR, texto: "hola" });
    await setDoc(doc(db, "users", JUGADOR, "desbloqueos", POST), { creadorId: CREADOR, via: "acierto" });
    await setDoc(doc(db, "compras", "cs_1"), { uid: JUGADOR, monedas: 100 });

    const st = ctx.storage();
    await uploadBytes(ref(st, `originales/${CREADOR}/${POST}`), img, { contentType: "image/jpeg" });
    await uploadBytes(ref(st, `borrosas/${POST}.jpg`), img, { contentType: "image/jpeg" });
  });
});

const como = (uid: string) => env.authenticatedContext(uid);
const anonimo = () => env.unauthenticatedContext();

describe("Firestore · publicaciones eliminadas", () => {
  it("las lee el creador y quien las desbloqueó; nadie más", async () => {
    await assertSucceeds(getDoc(doc(como(CREADOR).firestore(), "posts", "eliminada")));
    await assertSucceeds(getDoc(doc(como(JUGADOR).firestore(), "posts", "eliminada")));
    await assertFails(getDoc(doc(como(OTRO).firestore(), "posts", "eliminada")));
  });
});

describe("Firestore · estadísticas", () => {
  it("solo las lee el administrador", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "estadisticas", "2026-10-27"), { activos: 3 }));
    await assertSucceeds(getDoc(doc(como("y4KUHbYPChSM2QFa7VMoAyX3a952").firestore(), "estadisticas", "2026-10-27")));
    await assertFails(getDoc(doc(como(JUGADOR).firestore(), "estadisticas", "2026-10-27")));
    await assertFails(setDoc(doc(como("y4KUHbYPChSM2QFa7VMoAyX3a952").firestore(), "estadisticas", "x"), { activos: 1 }));
  });
});

describe("Firestore · bloqueos", () => {
  it("solo el dueño ve a quién bloqueó; nadie lo escribe desde el cliente", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "users", JUGADOR, "bloqueados", OTRO), { creadoEn: Timestamp.now() }));
    await assertSucceeds(getDoc(doc(como(JUGADOR).firestore(), "users", JUGADOR, "bloqueados", OTRO)));
    await assertFails(getDoc(doc(como(OTRO).firestore(), "users", JUGADOR, "bloqueados", OTRO)));
    await assertFails(setDoc(doc(como(JUGADOR).firestore(), "users", JUGADOR, "bloqueados", CREADOR), { creadoEn: Timestamp.now() }));
  });
  it("problemas y reportes no se leen desde el cliente", async () => {
    await assertFails(getDocs(collection(como(JUGADOR).firestore(), "problemas")));
  });
});

describe("Firestore · reels", () => {
  it("los publicados los lee cualquier registrado; los que se suben, solo su autor", async () => {
    await assertSucceeds(getDoc(doc(como(OTRO).firestore(), "reels", "rPub")));
    await assertFails(getDoc(doc(anonimo().firestore(), "reels", "rPub")));
    await assertFails(getDoc(doc(como(OTRO).firestore(), "reels", "rSub")));
    await assertSucceeds(getDoc(doc(como(CREADOR).firestore(), "reels", "rSub")));
    await assertFails(setDoc(doc(como(CREADOR).firestore(), "reels", "nuevo"), { autorId: CREADOR, estado: "publicado" }));
  });
});

describe("Firestore · perfiles", () => {
  it("un registrado lee perfiles públicos; un anónimo no", async () => {
    await assertSucceeds(getDoc(doc(como(OTRO).firestore(), "users", CREADOR)));
    await assertFails(getDoc(doc(anonimo().firestore(), "users", CREADOR)));
  });

  it("el dueño activa o desactiva el modo incógnito (solo sí/no); otro no", async () => {
    await assertSucceeds(updateDoc(doc(como(JUGADOR).firestore(), "users", JUGADOR), { incognito: true }));
    await assertFails(updateDoc(doc(como(JUGADOR).firestore(), "users", JUGADOR), { incognito: "sí" }));
    await assertFails(updateDoc(doc(como(OTRO).firestore(), "users", JUGADOR), { incognito: false }));
  });

  it("el dueño cambia avatar e intereses", async () => {
    await assertSucceeds(updateDoc(doc(como(JUGADOR).firestore(), "users", JUGADOR), { intereses: ["Viajes"], avatarUrl: "x" }));
  });

  it("el dueño no puede tocar contadores, VIP ni nombre", async () => {
    const db = como(JUGADOR).firestore();
    await assertFails(updateDoc(doc(db, "users", JUGADOR), { seguidores: 9999 }));
    await assertFails(updateDoc(doc(db, "users", JUGADOR), { esVip: true }));
    await assertFails(updateDoc(doc(db, "users", JUGADOR), { username: "otro" }));
    await assertFails(updateDoc(doc(db, "users", JUGADOR), { totalDesbloqueos: 5 }));
  });

  it("nadie edita el perfil de otro ni crea perfiles", async () => {
    await assertFails(updateDoc(doc(como(OTRO).firestore(), "users", JUGADOR), { intereses: [] }));
    await assertFails(setDoc(doc(como("nuevo").firestore(), "users", "nuevo"), { username: "nuevo" }));
  });
});

describe("Firestore · datos privados", () => {
  it("solo el dueño lee private/{uid}", async () => {
    await assertSucceeds(getDoc(doc(como(JUGADOR).firestore(), "private", JUGADOR)));
    await assertFails(getDoc(doc(como(OTRO).firestore(), "private", JUGADOR)));
  });

  it("el dueño no puede escribir monedas ni vidas", async () => {
    const db = como(JUGADOR).firestore();
    await assertFails(updateDoc(doc(db, "private", JUGADOR), { monedas: 1_000_000 }));
    await assertFails(updateDoc(doc(db, "private", JUGADOR), { vidas: 3 }));
    await assertFails(setDoc(doc(db, "private", JUGADOR), { monedas: 1 }));
  });
});

describe("Firestore · juego", () => {
  it("el cliente no puede crear desbloqueos, progreso ni intentos", async () => {
    const db = como(OTRO).firestore();
    await assertFails(setDoc(doc(db, "users", OTRO, "desbloqueos", POST), { via: "acierto" }));
    await assertFails(setDoc(doc(db, "users", OTRO, "progreso", CREADOR), { siguienteOrden: 5 }));
    await assertFails(setDoc(doc(db, "users", OTRO, "intentos", POST), { preguntasUsadas: 0 }));
    await assertFails(deleteDoc(doc(como(JUGADOR).firestore(), "users", JUGADOR, "desbloqueos", POST)));
  });

  it("el dueño lee sus desbloqueos; otro no", async () => {
    await assertSucceeds(getDoc(doc(como(JUGADOR).firestore(), "users", JUGADOR, "desbloqueos", POST)));
    await assertFails(getDoc(doc(como(OTRO).firestore(), "users", JUGADOR, "desbloqueos", POST)));
  });

  it("nadie lee las preguntas, ni siquiera el creador", async () => {
    await assertFails(getDoc(doc(como(CREADOR).firestore(), "posts", POST, "preguntas", "0")));
    await assertFails(getDocs(collection(como(JUGADOR).firestore(), "posts", POST, "preguntas")));
  });

  it("el cliente no puede escribir posts ni contadores", async () => {
    const db = como(CREADOR).firestore();
    await assertFails(updateDoc(doc(db, "posts", POST), { meGusta: 1000 }));
    await assertFails(updateDoc(doc(db, "posts", POST), { estado: "aprobada" }));
    await assertFails(setDoc(doc(db, "posts", "nuevo"), { creadorId: CREADOR, estado: "aprobada" }));
    await assertFails(setDoc(doc(db, "posts", POST, "meGusta", CREADOR), {}));
  });

  it("publicaciones en revisión solo las ve su creador", async () => {
    await assertSucceeds(getDoc(doc(como(CREADOR).firestore(), "posts", POST_REVISION)));
    await assertFails(getDoc(doc(como(JUGADOR).firestore(), "posts", POST_REVISION)));
    await assertSucceeds(getDoc(doc(como(JUGADOR).firestore(), "posts", POST)));
  });

  it("las publicaciones ocultas solo las ve su creador", async () => {
    await assertFails(getDoc(doc(como(JUGADOR).firestore(), "posts", "oculto")));
    await assertSucceeds(getDoc(doc(como(CREADOR).firestore(), "posts", "oculto")));
  });

  it("el feed puede consultar las fotos aprobadas y visibles de un creador", async () => {
    const q = query(collection(como(JUGADOR).firestore(), "posts"),
      where("creadorId", "==", CREADOR), where("estado", "==", "aprobada"), where("oculta", "==", false), orderBy("orden"));
    await assertSucceeds(getDocs(q));
    await assertFails(getDocs(query(collection(como(JUGADOR).firestore(), "posts"), where("creadorId", "==", CREADOR))));
  });
});

describe("Firestore · comentarios", () => {
  it("los leen quien desbloqueó y el creador", async () => {
    await assertSucceeds(getDocs(collection(como(JUGADOR).firestore(), "posts", POST, "comentarios")));
    await assertSucceeds(getDocs(collection(como(CREADOR).firestore(), "posts", POST, "comentarios")));
  });

  it("no los lee quien no desbloqueó", async () => {
    await assertFails(getDocs(collection(como(OTRO).firestore(), "posts", POST, "comentarios")));
  });

  it("el cliente no escribe comentarios directamente", async () => {
    await assertFails(setDoc(doc(como(JUGADOR).firestore(), "posts", POST, "comentarios", "c2"), { texto: "x" }));
  });
});

describe("Firestore · dinero y reportes", () => {
  it("compras: solo el comprador las lee; nadie las escribe", async () => {
    await assertSucceeds(getDoc(doc(como(JUGADOR).firestore(), "compras", "cs_1")));
    await assertFails(getDoc(doc(como(OTRO).firestore(), "compras", "cs_1")));
    await assertFails(setDoc(doc(como(JUGADOR).firestore(), "compras", "cs_2"), { uid: JUGADOR, monedas: 2400 }));
  });

  it("retiros y reportes cerrados al cliente", async () => {
    await assertFails(setDoc(doc(como(CREADOR).firestore(), "retiros", "r1"), { uid: CREADOR }));
    await assertFails(setDoc(doc(como(JUGADOR).firestore(), "reportes", "r1"), { postId: POST }));
    await assertFails(getDocs(collection(como(JUGADOR).firestore(), "reportes")));
  });

  it("colecciones no listadas están cerradas", async () => {
    await assertFails(setDoc(doc(como(JUGADOR).firestore(), "cualquiera", "x"), { a: 1 }));
  });
});

describe("Storage", () => {
  it("la original la ve el creador y quien la desbloqueó", async () => {
    await assertSucceeds(getBytes(ref(como(CREADOR).storage(), `originales/${CREADOR}/${POST}`)));
    await assertSucceeds(getBytes(ref(como(JUGADOR).storage(), `originales/${CREADOR}/${POST}`)));
  });

  it("la original no la ve quien no la desbloqueó ni un anónimo", async () => {
    await assertFails(getBytes(ref(como(OTRO).storage(), `originales/${CREADOR}/${POST}`)));
    await assertFails(getBytes(ref(anonimo().storage(), `originales/${CREADOR}/${POST}`)));
  });

  it("la borrosa es pública para registrados", async () => {
    await assertSucceeds(getBytes(ref(como(OTRO).storage(), `borrosas/${POST}.jpg`)));
    await assertFails(getBytes(ref(anonimo().storage(), `borrosas/${POST}.jpg`)));
  });

  it("el creador sube la original de una publicación que espera archivo", async () => {
    const st = como(CREADOR).storage();
    await assertSucceeds(uploadBytes(ref(st, `originales/${CREADOR}/post9`), img, { contentType: "image/jpeg" }));
    await assertSucceeds(uploadBytes(ref(st, `originales/${CREADOR}/video1`), img, { contentType: "video/mp4" }));
  });

  it("no se reemplaza, no se sube en nombre de otro ni con el tipo equivocado", async () => {
    const st = como(CREADOR).storage();
    await assertFails(uploadBytes(ref(st, `originales/${CREADOR}/${POST}`), img, { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(como(OTRO).storage(), `originales/${CREADOR}/post10`), img, { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(como(OTRO).storage(), `originales/${OTRO}/post10`), img, { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(st, `originales/${CREADOR}/post11`), img, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(st, `originales/${CREADOR}/post11`), img, { contentType: "video/mp4" }));
    await assertFails(uploadBytes(ref(st, `originales/${CREADOR}/no-existe`), img, { contentType: "image/jpeg" }));
  });

  it("nadie sube borrosas desde el cliente", async () => {
    await assertFails(uploadBytes(ref(como(CREADOR).storage(), `borrosas/${POST}.jpg`), img, { contentType: "image/jpeg" }));
  });

  it("cada uno sube solo su avatar", async () => {
    await assertSucceeds(uploadBytes(ref(como(JUGADOR).storage(), `avatares/${JUGADOR}.jpg`), img, { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(como(JUGADOR).storage(), `avatares/${OTRO}.jpg`), img, { contentType: "image/jpeg" }));
  });
});
