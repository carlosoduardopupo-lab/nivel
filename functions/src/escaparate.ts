// Escaparate público para la página de descarga (/descargar): las tarjetas del feed
// de los creadores más populares, como en la app (foto de perfil, nombre y datos).
// No expone fotos de publicaciones, preguntas ni datos privados. Cada creador puede
// salir con el ajuste "Aparecer en la web de Blurry" (ajustes.escaparate = false).
import { db } from "./comun.js";

export type TarjetaPublica = {
  username: string;
  avatarUrl: string | null;
  porcentajeMeGusta: number | null;
  porcentajeFallos: number;
  totalMeGusta: number;
  totalDesbloqueos: number;
  numPublicaciones: number;
  precioPromedio: number | null;
};

const MAX = 10;

/** Los creadores con más me gusta que tienen fotos publicadas y no se han salido del escaparate. */
export async function populares(): Promise<TarjetaPublica[]> {
  const users = await db().collection("users").where("esCreador", "==", true).orderBy("totalMeGusta", "desc").limit(MAX * 2).get();
  const tarjetas: TarjetaPublica[] = [];
  for (const u of users.docs) {
    if ((u.get("numPublicaciones") ?? 0) < 1) continue;
    if (u.get("incognito") === true) continue; // modo incógnito: no sale fuera del buscador
    if ((await db().doc(`private/${u.id}`).get()).get("ajustes.escaparate") === false) continue;
    tarjetas.push({
      username: u.get("username"),
      avatarUrl: u.get("avatarUrl") ?? null,
      porcentajeMeGusta: u.get("porcentajeMeGusta") ?? null,
      porcentajeFallos: u.get("porcentajeFallos") ?? 0,
      totalMeGusta: u.get("totalMeGusta") ?? 0,
      totalDesbloqueos: u.get("totalDesbloqueos") ?? 0,
      numPublicaciones: u.get("numPublicaciones") ?? 0,
      precioPromedio: u.get("precioPromedio") ?? null,
    });
    if (tarjetas.length >= MAX) break;
  }
  return tarjetas;
}
