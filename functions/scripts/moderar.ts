// Moderación manual de publicaciones.
//   npm run moderar -- lista              publicaciones en revisión
//   npm run moderar -- aprobar <postId>
//   npm run moderar -- rechazar <postId> [motivo]
//   npm run moderar -- ocultas            publicaciones ocultadas por reportes
//   npm run moderar -- mostrar <postId>   vuelve a mostrar una oculta
//   npm run moderar -- reels              reels ocultos por reportes
//   npm run moderar -- mostrar-reel <id>  vuelve a publicar un reel oculto
//   npm run moderar -- borrar-reel <id>   lo deja rechazado (fuera de Reels)
//   npm run moderar -- problemas          problemas que reportaron los usuarios
//   npm run moderar -- resuelto <id>      marca un problema como resuelto
// Añade --nube para trabajar sobre el proyecto real.
import { args, enNube } from "./entorno.js";
import { getFirestore } from "firebase-admin/firestore";
import { aprobarPublicacion, rechazarPublicacion } from "../src/moderacion.js";

const db = getFirestore();
const [orden, postId, ...resto] = args;

async function listar(consulta: FirebaseFirestore.Query) {
  const snap = await consulta.get();
  if (snap.empty) return console.log("No hay ninguna.");
  for (const d of snap.docs) {
    const p = d.data();
    const creador = (await db.doc(`users/${p.creadorId}`).get()).get("username");
    const pregunta = (await d.ref.collection("preguntas").doc("0").get()).data();
    console.log(`\n${d.id}  @${creador}  ${p.tipo}  ${p.precio} monedas  reportes: ${p.reportes ?? 0}`);
    console.log(`  Archivo:  ${p.rutaOriginal}`);
    if (pregunta) console.log(`  Pregunta: ${pregunta.texto}  →  ${pregunta.opciones[pregunta.correcta]}`);
  }
}

async function main() {
  console.log(enNube ? "⚠  Proyecto REAL" : "Emuladores locales");
  switch (orden) {
    case "lista":
      return listar(db.collection("posts").where("estado", "==", "revision").orderBy("creadoEn"));
    case "ocultas":
      return listar(db.collection("posts").where("oculta", "==", true));
    case "aprobar": {
      const { orden: n } = await aprobarPublicacion(postId);
      return console.log(`✓ Aprobada como nivel ${n + 1}.`);
    }
    case "rechazar":
      await rechazarPublicacion(postId, resto.join(" ") || "no cumple las normas");
      return console.log("✓ Rechazada.");
    case "reels": {
      const s = await db.collection("reels").where("estado", "==", "oculto").get();
      if (s.empty) return console.log("No hay ninguno.");
      for (const d of s.docs) {
        const autor = (await db.doc(`users/${d.get("autorId")}`).get()).get("username");
        console.log(`
${d.id}  @${autor}  reportes: ${d.get("reportes") ?? 0}
  Texto: ${d.get("texto") || "—"}
  Video: ${d.get("rutaVideo")}`);
      }
      return;
    }
    case "mostrar-reel":
      await db.doc(`reels/${postId}`).update({ estado: "publicado" });
      return console.log("✓ Reel publicado de nuevo.");
    case "borrar-reel":
      await db.doc(`reels/${postId}`).update({ estado: "rechazado", motivoRechazo: resto.join(" ") || "no cumple las normas" });
      return console.log("✓ Reel rechazado.");
    case "problemas": {
      const s = await db.collection("problemas").where("estado", "==", "abierto").get();
      if (s.empty) return console.log("No hay ninguno.");
      for (const d of s.docs) console.log(`
${d.id}  @${d.get("username")}  ${d.get("creadoEn")?.toDate().toISOString()}
  ${d.get("texto")}`);
      return;
    }
    case "resuelto":
      await db.doc(`problemas/${postId}`).update({ estado: "resuelto" });
      return console.log("✓ Marcado como resuelto.");
    case "mostrar":
      await db.doc(`posts/${postId}`).update({ oculta: false });
      return console.log("✓ Visible de nuevo.");
    default:
      console.log("Uso: npm run moderar -- lista | aprobar <id> | rechazar <id> [motivo] | ocultas | mostrar <id> | reels | mostrar-reel <id> | borrar-reel <id> | problemas | resuelto <id>");
  }
}

main().then(() => process.exit(0), (e) => { console.error("✗", e.message); process.exit(1); });
