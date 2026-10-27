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

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const EDAD_MINIMA = 18;
export const MAX_INTERESES = 10;
export const MAX_COMENTARIO = 140;
export const MAX_PREGUNTA = 90;
export const MAX_RESPUESTA = 30;
export const REPORTES_PARA_OCULTAR = 3;

export const INTERESES = [
  "Viajes", "Comida", "Autos", "Fitness", "Música", "Moda", "Cine", "Deportes",
  "Tecnología", "Arte", "Mascotas", "Naturaleza", "Fotografía", "Videojuegos", "Baile",
];

export const MOTIVOS_REPORTE = ["inapropiado", "menor", "robada", "respuesta", "otro"] as const;

// El "día" del juego (un intento por foto por día, vidas diarias) se cuenta en esta zona horaria.
export const ZONA_HORARIA = "America/New_York";

/** Día del juego como "AAAA-MM-DD". */
export function diaDe(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA, year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
}

/** Edad cumplida en `hoy` para una fecha "AAAA-MM-DD", o null si la fecha no es válida. */
export function edadDe(fechaNacimiento: string, hoy: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaNacimiento);
  if (!m) return null;
  const [a, mes, d] = [+m[1], +m[2], +m[3]];
  const f = new Date(Date.UTC(a, mes - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return null;
  if (f > hoy || a < 1900) return null;
  let edad = hoy.getUTCFullYear() - a;
  const cumple = Date.UTC(hoy.getUTCFullYear(), mes - 1, d);
  if (hoy.getTime() < cumple) edad--;
  return edad;
}
