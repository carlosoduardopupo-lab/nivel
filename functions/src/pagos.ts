// Compra de monedas con Stripe Checkout.
//   1. crearPago: crea la sesión de pago de Stripe y la apunta en pagos/{sesionId} (estado "abierto").
//   2. La persona paga en la página de Stripe y vuelve a la tienda (/?ir=tienda).
//   3. confirmarPagos: revisa en Stripe sus pagos abiertos y suma las monedas de los pagados,
//      una sola vez por pago. Se llama al abrir la tienda, así que aunque cierre la página
//      antes de volver, las monedas le llegan la próxima vez que entre.
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import Stripe from "stripe";
import { db, fallo } from "./comun.js";

/** Los paquetes que se pueden comprar (la app solo los muestra). Precio en centavos de dólar. */
export const PAQUETES: Record<string, { monedas: number; centavos: number }> = {
  p150: { monedas: 150, centavos: 199 },
  p550: { monedas: 550, centavos: 499 },
  p1150: { monedas: 1150, centavos: 999 },
  p2400: { monedas: 2400, centavos: 1999 },
};

/** Con la clave de prueba de Stripe solo compran los administradores (las monedas serían gratis). */
const ADMINS = ["y4KUHbYPChSM2QFa7VMoAyX3a952"]; // @carli (también en web/src/util.ts)

/** Direcciones a las que Stripe puede devolver a la persona después de pagar. */
const ORIGENES = ["https://blurry-78f0d.web.app", "https://blurry-78f0d.firebaseapp.com", "https://playblurry.com", "https://www.playblurry.com", "http://localhost:5173"];

function stripe(clave: string, uid: string): Stripe {
  if (!clave) fallo("pagos-apagados", "Los pagos todavía no están disponibles.");
  if (clave.startsWith("sk_test_") && !ADMINS.includes(uid)) fallo("pagos-apagados", "Los pagos todavía no están disponibles.");
  return new Stripe(clave);
}

export async function crearPago(clave: string, uid: string, correo: string | null, d: { paquete: unknown; origen: unknown }): Promise<{ url: string }> {
  const p = typeof d.paquete === "string" ? PAQUETES[d.paquete] : undefined;
  if (!p) fallo("dato-invalido", "Ese paquete no existe.", "invalid-argument");
  const origen = typeof d.origen === "string" && ORIGENES.includes(d.origen) ? d.origen : ORIGENES[0];
  const s = await stripe(clave, uid).checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: { currency: "usd", unit_amount: p.centavos, product_data: { name: `${p.monedas.toLocaleString("es")} monedas de Blurry` } },
    }],
    client_reference_id: uid,
    customer_email: correo ?? undefined,
    metadata: { uid, paquete: d.paquete as string },
    success_url: `${origen}/?ir=tienda&pago=ok`,
    cancel_url: `${origen}/?ir=tienda`,
  });
  await db().doc(`pagos/${s.id}`).set({
    uid, paquete: d.paquete, monedas: p.monedas, centavos: p.centavos, estado: "abierto", prueba: !s.livemode, creadoEn: Timestamp.now(),
  });
  return { url: s.url! };
}

/** Suma las monedas de los pagos de esta persona que ya se cobraron. Devuelve cuántas sumó. */
export async function confirmarPagos(clave: string, uid: string): Promise<{ monedas: number }> {
  const abiertos = await db().collection("pagos").where("uid", "==", uid).where("estado", "==", "abierto").limit(10).get();
  if (abiertos.empty) return { monedas: 0 };
  const api = stripe(clave, uid);
  let total = 0;
  for (const pago of abiertos.docs) {
    const s = await api.checkout.sessions.retrieve(pago.id);
    if (s.payment_status === "paid") {
      total += await db().runTransaction(async (tx) => {
        const actual = await tx.get(pago.ref);
        if (actual.get("estado") !== "abierto") return 0; // ya se sumó (otra pestaña, otro intento)
        const monedas = actual.get("monedas") as number;
        tx.update(pago.ref, { estado: "pagado", pagadoEn: Timestamp.now() });
        tx.update(db().doc(`private/${uid}`), { monedas: FieldValue.increment(monedas), monedasCompradas: FieldValue.increment(monedas) });
        return monedas;
      });
    } else if (s.status === "expired") {
      await pago.ref.update({ estado: "expirado" });
    }
  }
  return { monedas: total };
}
