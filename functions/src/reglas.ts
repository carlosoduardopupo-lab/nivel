// Constantes de REGLAS.md. El servidor es la única fuente de verdad.

export const VIDAS_POR_DIA = 3;
export const BLOQUEO_MS = 24 * 60 * 60 * 1000;
export const PREGUNTAS_POR_POST = 3;
export const MARGEN_RESPUESTA_MS = 2000;

export const PRECIO_MIN_FOTO = 1;
export const PRECIO_MIN_VIDEO = 3;
export const PRECIO_MAX_NORMAL = 20;
export const PRECIO_MAX_VIP = 100;
export const VIDEO_MAX_SEGUNDOS = 30;

// Dinero en milésimas de dólar.
export const MILESIMAS_POR_MONEDA = 5;
export const DIAS_EN_ESPERA = 7;
export const RETIRO_MINIMO_MILESIMAS = 50_000;

export const MIN_DESBLOQUEOS_PARA_PORCENTAJE = 20;

export const PAQUETES = {
  p100: { monedas: 100, centavos: 99 },
  p550: { monedas: 550, centavos: 499 },
  p1150: { monedas: 1150, centavos: 999 },
  p2400: { monedas: 2400, centavos: 1999 },
} as const;

/** Segundos para responder según el precio: 10 s con 1 moneda, +5 s por moneda extra, tope 30 s. */
export function tiempoDe(precio: number): number {
  return Math.min(30, 10 + 5 * (precio - 1));
}

export function precioMaximo(esVip: boolean): number {
  return esVip ? PRECIO_MAX_VIP : PRECIO_MAX_NORMAL;
}

/** Comisión de retiro en milésimas: $2 + 0.25% + $0.25. */
export function comisionRetiro(montoMilesimas: number): number {
  return 2000 + Math.round(montoMilesimas * 0.0025) + 250;
}
