// Estadísticas de uso.
//   npm run estadisticas                 informe de los últimos 14 días (emuladores)
//   npm run estadisticas -- --nube       informe del proyecto real
//   npm run estadisticas -- rellenar --nube
//       reconstruye los días ANTERIORES a hoy con lo que ya hay en la base de datos (cuentas,
//       fotos, reels, desbloqueos, intentos, comentarios y seguimientos). Los usuarios activos,
//       compartidos, visitas y descargas no se pueden reconstruir: se cuentan desde que se activó.
//       Con --incluir-hoy también reconstruye hoy (solo si las funciones aún no han contado nada hoy
//       en esos campos; si no, duplicaría).
import { args, enNube } from "./entorno.js";
import { getFirestore, type Timestamp } from "firebase-admin/firestore";
import { CAMPOS, type Campo } from "../src/estadisticas.js";
import { diaDe } from "../src/reglas.js";

const incluirHoy = process.argv.includes("--incluir-hoy");

const db = getFirestore();
const [orden] = args;

async function informe() {
  const dias = Array.from({ length: 14 }, (_, i) => diaDe(new Date(Date.now() - (13 - i) * 86_400_000)));
  const snaps = await Promise.all(dias.map((d) => db.doc(`estadisticas/${d}`).get()));
  const visibles: Campo[] = ["activos", "registros", "intentos", "aciertos", "pagos", "publicaciones", "reels", "comentarios", "referidos", "compartidos", "visitasDescarga", "descargasApk"];
  const tabla = Object.fromEntries(dias.map((d, i) => [d, Object.fromEntries(visibles.map((c) => [c, snaps[i].get(c) ?? 0]))]));
  console.table(tabla);
}

async function rellenar() {
  const hoy = diaDe(new Date());
  const cuentas = new Map<string, Partial<Record<Campo, number>>>();
  const sumar = (t: Timestamp | undefined, campo: Campo, n = 1) => {
    if (!t?.toDate) return;
    const dia = diaDe(t.toDate());
    if (dia > hoy || (dia === hoy && !incluirHoy)) return; // hoy ya lo cuentan las funciones en vivo
    const c = cuentas.get(dia) ?? {};
    c[campo] = (c[campo] ?? 0) + n;
    cuentas.set(dia, c);
  };
  for (const d of (await db.collection("users").get()).docs) sumar(d.get("creadoEn"), "registros");
  for (const d of (await db.collection("posts").where("estado", "in", ["aprobada", "eliminada"]).get()).docs) sumar(d.get("aprobadaEn") ?? d.get("creadoEn"), "publicaciones");
  for (const d of (await db.collection("reels").where("estado", "==", "publicado").get()).docs) sumar(d.get("publicadoEn") ?? d.get("creadoEn"), "reels");
  for (const d of (await db.collectionGroup("desbloqueos").get()).docs) {
    if (d.get("via") === "pago") { sumar(d.get("creadoEn"), "pagos"); sumar(d.get("creadoEn"), "monedasGastadas", d.get("monedas") ?? 0); }
    else sumar(d.get("creadoEn"), "aciertos");
  }
  for (const d of (await db.collectionGroup("intentos").get()).docs) sumar(d.get("inicioEn"), "intentos");
  for (const d of (await db.collectionGroup("comentarios").get()).docs) sumar(d.get("creadoEn"), "comentarios");
  for (const d of (await db.collectionGroup("siguiendo").get()).docs) sumar(d.get("creadoEn"), "seguimientos");

  // Solo se escriben los campos reconstruibles (se sobrescriben, así repetirlo no duplica).
  const lote = db.batch();
  for (const [dia, c] of [...cuentas].sort()) {
    lote.set(db.doc(`estadisticas/${dia}`), c, { merge: true });
    console.log(dia, JSON.stringify(c));
  }
  await lote.commit();
  console.log(`✓ ${cuentas.size} días rellenados (campos: ${CAMPOS.filter((c) => ["registros", "publicaciones", "reels", "pagos", "monedasGastadas", "aciertos", "intentos", "comentarios", "seguimientos"].includes(c)).join(", ")})`);
}

console.log(enNube ? "⚠  Proyecto REAL" : "Emuladores locales");
(orden === "rellenar" ? rellenar() : informe()).then(() => process.exit(0), (e) => { console.error("✗", e.message); process.exit(1); });
