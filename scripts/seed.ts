// Carga datos de prueba en los emuladores (nunca en la nube).
// Uso: con los emuladores encendidos, `npm run seed`.
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";

const PROYECTO = "demo-nivel";
initializeApp({ projectId: PROYECTO });
const db = getFirestore();
const auth = getAuth();

type Nivel = [pregunta: string, opciones: [string, string, string], correcta: number, precio: number];
type Creador = {
  username: string; intereses: string[]; seguidores: number; porcentajeFallos: number;
  meGusta: number; desbloqueos: number; colores: string[]; niveles: Nivel[];
};

// Los mismos creadores del prototipo.
const CREADORES: Creador[] = [
  { username: "vale_fit", intereses: ["Fitness", "Música", "Baile"], seguidores: 12100, porcentajeFallos: 55, meGusta: 7340, desbloqueos: 8250, colores: ["#F4C0D1"], niveles: [
    ["¿Qué desayuno antes de entrenar?", ["Avena", "Huevos", "Nada"], 0, 1],
    ["¿Cuántos días entreno a la semana?", ["3", "5", "6"], 1, 2],
    ["¿Mi ejercicio favorito?", ["Sentadillas", "Correr", "Yoga"], 0, 2],
    ["¿Cuál es mi sabor de helado favorito?", ["Fresa", "Chocolate", "Vainilla"], 0, 5],
    ["¿Qué música pongo para entrenar?", ["Reggaetón", "Salsa", "Rock"], 2, 3],
    ["¿A qué hora entreno?", ["5 a. m.", "Mediodía", "Noche"], 0, 4],
    ["¿Mi récord en sentadilla?", ["60 kg", "80 kg", "100 kg"], 1, 5],
  ] },
  { username: "sol_viajera", intereses: ["Viajes", "Fotografía", "Naturaleza"], seguidores: 8400, porcentajeFallos: 62, meGusta: 4210, desbloqueos: 4630, colores: ["#9FE1CB"], niveles: [
    ["¿Cuál fue mi primer viaje sola?", ["Cancún", "Madrid", "Lima"], 1, 1],
    ["¿Playa o montaña?", ["Playa", "Montaña", "Las dos"], 0, 1],
    ["¿Qué nunca falta en mi maleta?", ["Cámara", "Libro", "Audífonos"], 0, 2],
    ["¿Cuántos países he visitado?", ["8", "14", "21"], 1, 2],
    ["¿A qué país sueño viajar?", ["Japón", "Italia", "Grecia"], 0, 3],
    ["¿Mi comida favorita de viaje?", ["Ramen", "Tacos", "Paella"], 2, 3],
    ["¿Ventana o pasillo?", ["Ventana", "Pasillo", "Me da igual"], 0, 4],
    ["¿Qué ciudad repetiría?", ["París", "Tokio", "Cartagena"], 2, 5],
  ] },
  { username: "autos_rapidos", intereses: ["Autos", "Tecnología", "Deportes"], seguidores: 5200, porcentajeFallos: 71, meGusta: 2980, desbloqueos: 3550, colores: ["#B5D4F4"], niveles: [
    ["¿Qué marca fabrica el Mustang?", ["Ford", "Chevrolet", "Dodge"], 0, 1],
    ["¿Cuántos caballos tiene mi auto?", ["300", "450", "610"], 1, 2],
    ["¿En qué país se fabrica Ferrari?", ["Alemania", "Italia", "Francia"], 1, 1],
    ["¿Mi color de auto favorito?", ["Rojo", "Negro", "Azul"], 0, 2],
    ["¿Manual o automático?", ["Manual", "Automático", "Eléctrico"], 0, 3],
    ["¿Qué significa BMW?", ["Fábricas Bávaras de Motores", "Mejor Motor del Mundo", "Motores Berlineses"], 0, 3],
  ] },
  { username: "chef_nocturno", intereses: ["Comida", "Música"], seguidores: 9800, porcentajeFallos: 38, meGusta: 5120, desbloqueos: 5500, colores: ["#F5C4B3"], niveles: [
    ["¿Mi especia favorita?", ["Comino", "Pimentón", "Canela"], 1, 1],
    ["¿Qué cocino cuando estoy triste?", ["Sopa", "Pasta", "Arroz"], 1, 2],
    ["¿Cuál es el plato nacional de Perú?", ["Ceviche", "Arepa", "Mole"], 0, 1],
    ["¿Dulce, salado o picante?", ["Dulce", "Salado", "Picante"], 2, 2],
    ["¿Mi cuchillo tiene nombre?", ["Sí, Rocky", "No", "Sí, Lola"], 2, 3],
  ] },
  { username: "dani_beats", intereses: ["Música", "Baile", "Cine"], seguidores: 3300, porcentajeFallos: 44, meGusta: 1890, desbloqueos: 2625, colores: ["#CECBF6"], niveles: [
    ["¿Mi primer instrumento?", ["Guitarra", "Piano", "Batería"], 1, 1],
    ["¿Qué género produzco más?", ["Reggaetón", "House", "Trap"], 1, 2],
    ["¿Quién compuso \"Para Elisa\"?", ["Mozart", "Beethoven", "Bach"], 1, 1],
    ["¿Mi película musical favorita?", ["Whiplash", "La La Land", "Rocketman"], 0, 3],
  ] },
  { username: "mar_azul", intereses: ["Viajes", "Moda", "Naturaleza"], seguidores: 214, porcentajeFallos: 0, meGusta: 38, desbloqueos: 12, colores: ["#B5D4F4"], niveles: [
    ["¿Mi playa favorita?", ["Tulum", "Punta Cana", "Varadero"], 2, 1],
    ["¿Atardecer o amanecer?", ["Atardecer", "Amanecer", "Los dos"], 0, 2],
    ["¿Qué mar es más salado?", ["Caribe", "Mediterráneo", "Mar Muerto"], 2, 1],
    ["¿Mi color favorito?", ["Turquesa", "Blanco", "Coral"], 0, 2],
  ] },
];

// Preguntas extra (las "generadas por IA" en la app real). Se reparten sin repetir dentro de una foto.
const EXTRA: Nivel[] = [
  ["¿Qué estación del año prefiero?", ["Verano", "Invierno", "Otoño"], 0, 0],
  ["¿Perro o gato?", ["Perro", "Gato", "Ninguno"], 0, 0],
  ["¿Café o té?", ["Café", "Té", "Ninguno"], 0, 0],
  ["¿Madrugo o trasnocho?", ["Madrugo", "Trasnocho", "Depende"], 1, 0],
  ["¿Mi número favorito?", ["3", "7", "9"], 1, 0],
  ["¿Ciudad o campo?", ["Ciudad", "Campo", "Las dos"], 0, 0],
  ["¿Qué red social uso más?", ["Instagram", "TikTok", "YouTube"], 1, 0],
  ["¿Dulce favorito?", ["Chocolate", "Gomitas", "Helado"], 0, 0],
  ["¿Cuántos hermanos tengo?", ["0", "1", "2"], 2, 0],
  ["¿Mi día favorito de la semana?", ["Viernes", "Sábado", "Domingo"], 1, 0],
];

const INTERESES_JUGADOR = ["Viajes", "Música", "Fitness"];
const tiempoDe = (p: number) => Math.min(30, 10 + 5 * (p - 1));
const pctMeGusta = (c: Creador) => (c.desbloqueos >= 20 ? Math.round((c.meGusta / c.desbloqueos) * 100) : null);

async function crearUsuarioAuth(uid: string, correo: string) {
  try {
    await auth.deleteUser(uid);
  } catch {
    /* no existía */
  }
  await auth.createUser({ uid, email: correo, password: "nivel1234", emailVerified: true });
}

async function borrarTodo() {
  // El emulador permite vaciar la base con una sola llamada REST.
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`No se pudo vaciar Firestore: ${res.status}`);
}

async function main() {
  await borrarTodo();
  const ahora = Date.now();
  let extra = 0;

  for (const [ci, c] of CREADORES.entries()) {
    const uid = `uid_${c.username}`;
    await crearUsuarioAuth(uid, `${c.username}@nivel.test`);
    const b = db.batch();
    b.set(db.doc(`users/${uid}`), {
      username: c.username, usernameLower: c.username.toLowerCase(), avatarUrl: null, intereses: c.intereses,
      seguidores: c.seguidores, siguiendo: 0, totalMeGusta: c.meGusta, totalDesbloqueos: c.desbloqueos,
      totalIntentos: 0, totalFallos: 0, porcentajeMeGusta: pctMeGusta(c), porcentajeFallos: c.porcentajeFallos,
      numPublicaciones: c.niveles.length, ultimaPublicacionEn: Timestamp.fromMillis(ahora - ci * 3_600_000),
      esVip: false, identidadVerificada: false, creadoEn: Timestamp.fromMillis(ahora - 90 * 86_400_000),
    });
    b.set(db.doc(`usernames/${c.username.toLowerCase()}`), { uid });
    b.set(db.doc(`private/${uid}`), {
      nombreReal: c.username, fechaNacimiento: "1995-01-01", correo: `${c.username}@nivel.test`,
      monedas: 0, vidas: 3, vidasVuelvenEn: null, gananciasDisponibles: 0, gananciasEnEspera: 0, stripeCuentaId: null,
    });

    c.niveles.forEach(([texto, opciones, correcta, precio], orden) => {
      const postId = `${c.username}_${orden}`;
      b.set(db.doc(`posts/${postId}`), {
        creadorId: uid, orden, tipo: "foto", precio, tiempo: tiempoDe(precio), estado: "aprobada", oculta: false,
        rutaOriginal: `originales/${uid}/${postId}`, rutaBorrosa: null, colorDemo: c.colores[0],
        meGusta: 40 + ((orden * 97) % 380), desbloqueos: 0, fallos: 0, intentos: 0, reportes: 0, comentarios: 0,
        creadoEn: Timestamp.fromMillis(ahora - (c.niveles.length - orden) * 86_400_000),
      });
      const ia1 = EXTRA[extra++ % EXTRA.length];
      const ia2 = EXTRA[extra++ % EXTRA.length];
      const preguntas = [
        { texto, opciones, correcta, autor: "creador" },
        { texto: ia1[0], opciones: ia1[1], correcta: ia1[2], autor: "ia" },
        { texto: ia2[0], opciones: ia2[1], correcta: ia2[2], autor: "ia" },
      ];
      preguntas.forEach((p, n) => b.set(db.doc(`posts/${postId}/preguntas/${n}`), p));
    });
    await b.commit();
    console.log(`✓ @${c.username}: ${c.niveles.length} fotos`);
  }

  // Un jugador de prueba como el del prototipo (luna_misterio).
  const uid = "uid_luna_misterio";
  await crearUsuarioAuth(uid, "luna@nivel.test");
  const b = db.batch();
  b.set(db.doc(`users/${uid}`), {
    username: "luna_misterio", usernameLower: "luna_misterio", avatarUrl: null, intereses: INTERESES_JUGADOR,
    seguidores: 0, siguiendo: 3, totalMeGusta: 0, totalDesbloqueos: 0, totalIntentos: 0, totalFallos: 0,
    porcentajeMeGusta: null, porcentajeFallos: 0, numPublicaciones: 0, ultimaPublicacionEn: null,
    esVip: false, identidadVerificada: false, creadoEn: Timestamp.now(),
  });
  b.set(db.doc("usernames/luna_misterio"), { uid });
  b.set(db.doc(`private/${uid}`), {
    nombreReal: "Luna Prueba", fechaNacimiento: "1998-05-10", correo: "luna@nivel.test",
    monedas: 85, vidas: 3, vidasVuelvenEn: null, gananciasDisponibles: 0, gananciasEnEspera: 0, stripeCuentaId: null,
  });
  for (const seguido of ["vale_fit", "sol_viajera", "chef_nocturno"]) {
    b.set(db.doc(`users/${uid}/siguiendo/uid_${seguido}`), { creadoEn: Timestamp.now() });
  }
  await b.commit();
  console.log("✓ jugador @luna_misterio (luna@nivel.test / nivel1234) con 85 monedas");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
