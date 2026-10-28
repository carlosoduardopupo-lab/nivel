// Compra de monedas con Stripe Checkout.
//   1. crearPago: crea la sesión de pago de Stripe y la apunta en pagos/{sesionId} (estado "abierto").
//   2. La persona paga en la página de Stripe y vuelve a la tienda (/?ir=tienda).
//   3. confirmarPagos: revisa en Stripe sus pagos abiertos y suma las monedas de los pagados,
//      una sola vez por pago. Se llama al abrir la tienda, así que aunque cierre la página
//      antes de volver, las monedas le llegan la próxima vez que entre.
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import Stripe from "stripe";
import { db, fallo } from "./comun.js";
import { comisionRetiro, PAQUETES as PAQ, RETIRO_MINIMO_MILESIMAS } from "./reglas.js";

/** Los paquetes que se pueden comprar (la app solo los muestra). Precio en centavos de dólar. */
const PAQUETES: Record<string, { monedas: number; centavos: number }> = PAQ;

/** Con una clave de prueba de Stripe (sk_test_ o rk_test_) solo compran los administradores (las monedas serían gratis). */
const ADMINS = ["y4KUHbYPChSM2QFa7VMoAyX3a952"]; // @carli (también en web/src/util.ts)

/** Direcciones a las que Stripe puede devolver a la persona después de pagar. */
const ORIGENES = ["https://blurry-78f0d.web.app", "https://blurry-78f0d.firebaseapp.com", "https://playblurry.com", "https://www.playblurry.com", "http://localhost:5173"];

function stripe(clave: string, uid: string): Stripe {
  if (!clave) fallo("pagos-apagados", "Los pagos todavía no están disponibles.");
  if (clave.includes("_test_") && !ADMINS.includes(uid)) fallo("pagos-apagados", "Los pagos todavía no están disponibles.");
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
  }).catch((e: unknown) => {
    // Errores de Stripe (cuenta sin configurar, caída…): se registran y la persona ve un aviso claro.
    logger.error("Stripe no pudo crear el pago", e instanceof Stripe.errors.StripeError ? e.message : e);
    return fallo("pago-no-disponible", "No se pudo abrir el pago. Inténtalo de nuevo en un rato.");
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
  const modoPrueba = clave.includes("_test_");
  for (const pago of abiertos.docs) {
    // Un pago abierto con la otra clave (prueba ↔ real) no existe para esta: se salta.
    if ((pago.get("prueba") === true) !== modoPrueba) continue;
    const s = await api.checkout.sessions.retrieve(pago.id).catch((e: unknown) => {
      logger.error("Stripe no pudo consultar el pago", pago.id, e instanceof Stripe.errors.StripeError ? e.message : e);
      return null;
    });
    if (!s) continue;
    if (s.payment_status === "paid") {
      total += await db().runTransaction(async (tx) => {
        const actual = await tx.get(pago.ref);
        if (actual.get("estado") !== "abierto") return 0; // ya se sumó (otra pestaña, otro intento)
        const monedas = actual.get("monedas") as number;
        tx.update(pago.ref, { estado: "pagado", pagadoEn: Timestamp.now() });
        // Las compradas en modo prueba cuentan como regalo: no generan ganancias reales a los creadores.
        const regalo = actual.get("prueba") === true ? { monedasRegalo: FieldValue.increment(monedas) } : {};
        tx.update(db().doc(`private/${uid}`), { monedas: FieldValue.increment(monedas), monedasCompradas: FieldValue.increment(monedas), ...regalo });
        return monedas;
      });
    } else if (s.status === "expired") {
      await pago.ref.update({ estado: "expirado" });
    }
  }
  return { monedas: total };
}

// ---------------------------------------------------------------------------
// Retiros de los creadores con Stripe Connect (cuentas Express).
//   1. conectarBanco: crea su cuenta conectada (una vez) y devuelve el enlace de Stripe donde
//      la persona pone su identidad y su banco. Stripe guarda esos datos, nunca Blurry.
//   2. estadoBanco: pregunta a Stripe si la cuenta ya puede recibir dinero.
//   3. retirar: pasa todo lo disponible (menos la comisión) a su cuenta conectada; Stripe lo
//      deposita en su banco en los días siguientes.
// Las ganancias se liberan a los DIAS_EN_ESPERA con liberarGanancias (cada día).

/** Países donde un creador puede cobrar (Stripe Connect desde una plataforma de EE. UU.). */
export const PAISES_RETIRO = ["US", "MX", "ES", "CO", "AR", "CL", "PE", "BR", "CA", "GB", "FR", "IT", "DE", "PT"];

export async function conectarBanco(clave: string, uid: string, correo: string | null, d: { pais: unknown; origen: unknown }): Promise<{ url: string }> {
  const api = stripe(clave, uid);
  const origen = typeof d.origen === "string" && ORIGENES.includes(d.origen) ? d.origen : ORIGENES[0];
  const ref = db().doc(`private/${uid}`);
  let cuenta = (await ref.get()).get("stripeCuentaId") as string | null;
  if (!cuenta) {
    const pais = typeof d.pais === "string" && PAISES_RETIRO.includes(d.pais) ? d.pais : fallo("dato-invalido", "Elige tu país.", "invalid-argument");
    const c = await api.accounts.create({
      type: "express",
      country: pais,
      email: correo ?? undefined,
      business_type: "individual",
      capabilities: { transfers: { requested: true } },
      // Fuera de EE. UU. la cuenta solo recibe dinero de Blurry (acuerdo de "destinatario").
      ...(pais === "US" ? {} : { tos_acceptance: { service_agreement: "recipient" } }),
      metadata: { uid },
    }).catch((e: unknown) => {
      logger.error("Stripe no pudo crear la cuenta conectada", e instanceof Stripe.errors.StripeError ? e.message : e);
      return fallo("pago-no-disponible", "No se pudo conectar con Stripe. Inténtalo de nuevo en un rato.");
    });
    cuenta = c.id;
    await ref.update({ stripeCuentaId: cuenta, stripeListo: false });
  }
  const link = await api.accountLinks.create({
    account: cuenta, type: "account_onboarding",
    refresh_url: `${origen}/?ir=retiro`, return_url: `${origen}/?ir=retiro`,
  });
  return { url: link.url };
}

export async function estadoBanco(clave: string, uid: string): Promise<{ conectada: boolean; lista: boolean }> {
  const ref = db().doc(`private/${uid}`);
  const cuenta = (await ref.get()).get("stripeCuentaId") as string | null;
  if (!cuenta) return { conectada: false, lista: false };
  const c = await stripe(clave, uid).accounts.retrieve(cuenta);
  const lista = c.capabilities?.transfers === "active" && c.payouts_enabled === true;
  await ref.update({ stripeListo: lista });
  return { conectada: true, lista };
}

export async function retirar(clave: string, uid: string): Promise<{ enviado: number }> {
  const api = stripe(clave, uid);
  const ref = db().doc(`private/${uid}`);
  const retiro = db().collection(`private/${uid}/retiros`).doc();
  // 1. Se descuenta del saldo en una transacción (no se puede retirar dos veces lo mismo).
  const { disp, neto, cuenta } = await db().runTransaction(async (tx) => {
    const p = await tx.get(ref);
    const disp = (p.get("gananciasDisponibles") ?? 0) as number;
    const cuenta = p.get("stripeCuentaId") as string | null;
    if (!cuenta || p.get("stripeListo") !== true) fallo("sin-banco", "Primero conecta tu cuenta bancaria.");
    if (disp < RETIRO_MINIMO_MILESIMAS) fallo("minimo", "El mínimo para retirar es $15.");
    const comision = comisionRetiro(disp);
    const neto = Math.floor((disp - comision) / 10) * 10; // centavos enteros
    tx.update(ref, { gananciasDisponibles: FieldValue.increment(-disp) });
    tx.set(retiro, { milesimas: disp, comision, neto, cuenta, estado: "enviando", creadoEn: Timestamp.now() });
    return { disp, neto, cuenta: cuenta! };
  });
  // 2. Se envía a su cuenta de Stripe. Si falla, se le devuelve el saldo.
  try {
    const t = await api.transfers.create({ amount: neto / 10, currency: "usd", destination: cuenta, metadata: { uid, retiro: retiro.id } }, { idempotencyKey: retiro.id });
    await retiro.update({ estado: "enviado", transferencia: t.id });
    return { enviado: neto };
  } catch (e) {
    logger.error("Stripe no pudo enviar el retiro", e instanceof Stripe.errors.StripeError ? e.message : e);
    const lote = db().batch();
    lote.update(ref, { gananciasDisponibles: FieldValue.increment(disp) });
    lote.update(retiro, { estado: "fallido" });
    await lote.commit();
    return fallo("retiro-fallido", "No se pudo enviar el retiro. Tu saldo sigue intacto; inténtalo más tarde.");
  }
}

/** Pasa a "disponible" lo ganado hace más de DIAS_EN_ESPERA días. */
export async function liberarGanancias(ahora = new Date()): Promise<number> {
  const s = await db().collectionGroup("ganancias").where("liberado", "==", false).where("liberaEn", "<=", Timestamp.fromDate(ahora)).limit(400).get();
  for (const g of s.docs) {
    const privado = g.ref.parent.parent!;
    await db().runTransaction(async (tx) => {
      const actual = await tx.get(g.ref);
      if (actual.get("liberado") !== false) return;
      const m = actual.get("milesimas") as number;
      tx.update(g.ref, { liberado: true });
      tx.update(privado, { gananciasEnEspera: FieldValue.increment(-m), gananciasDisponibles: FieldValue.increment(m) });
    });
  }
  return s.size;
}
