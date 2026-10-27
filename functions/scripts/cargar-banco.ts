// Carga (o actualiza) el banco de preguntas generales desde banco.json.
// Se usan cuando un jugador falla y ya no quedan preguntas de otras fotos del creador.
//   npm run banco            → emuladores
//   npm run banco -- --nube  → proyecto real
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { enNube } from "./entorno.js";
import { getFirestore } from "firebase-admin/firestore";

type Fila = [pregunta: string, correcta: string, falsa1: string, falsa2: string];

export async function cargarBanco(): Promise<number> {
  const db = getFirestore();
  const filas = JSON.parse(readFileSync(new URL("./banco.json", import.meta.url), "utf8")) as Fila[];
  const lote = db.batch();
  for (const [texto, correcta, f1, f2] of filas) {
    // Id estable: volver a cargar no duplica preguntas.
    const id = createHash("sha1").update(texto).digest("hex").slice(0, 20);
    lote.set(db.doc(`bancoPreguntas/${id}`), { texto, opciones: [correcta, f1, f2], correcta: 0, activa: true, aleatorio: Math.random() }, { merge: true });
  }
  await lote.commit();
  return filas.length;
}

if (process.argv[1]?.endsWith("cargar-banco.ts")) {
  console.log(enNube ? "⚠  Proyecto REAL" : "Emuladores locales");
  cargarBanco().then((n) => { console.log(`✓ ${n} preguntas en el banco`); process.exit(0); }, (e) => { console.error(e); process.exit(1); });
}
