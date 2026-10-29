// Constantes de REGLAS.md. El servidor es la única fuente de verdad.

export const VIDAS_POR_DIA = 3;
export const BLOQUEO_MS = 24 * 60 * 60 * 1000;
export const PREGUNTAS_POR_POST = 1;
// Mientras sea true, toda publicación se aprueba sola al terminar de procesarse (sin revisión manual).
export const APROBACION_AUTOMATICA = true;
// Fase de prueba: no hay compras ni retiros. Las monedas que se gastan en una foto se le
// suman al creador (como monedas de regalo) para probar el sistema; no generan dinero.
export const FASE_PRUEBA = false;
export const MARGEN_RESPUESTA_MS = 2000;

export const PRECIO_MIN_FOTO = 1;
export const PRECIO_MIN_VIDEO = 3;
export const PRECIO_MAX_NORMAL = 20;
export const PRECIO_MAX_VIP = 100;
export const VIDEO_MAX_SEGUNDOS = 30;

// Reels (gratis, para darse a conocer).
export const REEL_MAX_SEGUNDOS = 60;
export const MAX_TEXTO_REEL = 150;

// Dinero en milésimas de dólar.
export const MILESIMAS_POR_MONEDA = 5;
// Regalo al crear la cuenta: desbloquean fotos, pero no se le pagan al creador.
export const MONEDAS_BIENVENIDA = 100;
// Referidos: cada amigo nuevo que se registra con tu código te recarga las 3 vidas, y al
// registrarse el tercero ganas 500 monedas de regalo (una sola vez).
export const MONEDAS_POR_REFERIDO = [0, 0, 500];
export const MAX_MONEDAS_REFERIDOS = 500;
export const DIAS_EN_ESPERA = 7;
export const RETIRO_MINIMO_MILESIMAS = 15_000;
// Las ganancias se acumulan siempre, pero solo se pueden retirar con este número de seguidores.
export const SEGUIDORES_PARA_RETIRAR = 1000;

export const MIN_DESBLOQUEOS_PARA_PORCENTAJE = 20;

export const PAQUETES = {
  p150: { monedas: 150, centavos: 199 },
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

/** Precio promedio de las publicaciones de un creador (redondeado), o null si no tiene. */
export function precioPromedio(precios: number[]): number | null {
  return precios.length ? Math.round(precios.reduce((a, b) => a + b, 0) / precios.length) : null;
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
