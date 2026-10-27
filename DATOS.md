# Modelo de datos (Firestore)

Convenciones:
- Fechas: `Timestamp` de Firestore.
- Dinero: enteros en **milésimas de dólar** (`1000` = $1.00). 1 moneda gastada = 5 milésimas para el creador.
- "Solo Functions" = el cliente no puede escribir (las reglas lo bloquean); lo escribe el Admin SDK.
- "Día del juego" (intentos y vidas) = día en la hora de Nueva York (`America/New_York`), formato `AAAA-MM-DD`.

## users/{uid} — perfil público
Lectura: usuarios registrados. Escritura del dueño solo en `avatarUrl` e `intereses`; el resto, solo Functions.

| Campo | Tipo | Notas |
|---|---|---|
| username | string | único, `^[a-zA-Z0-9_]{3,20}$`. Lo fija Functions al registrarse |
| usernameLower | string | para búsquedas y unicidad |
| avatarUrl | string \| null | |
| intereses | string[] | máximo 10, de la lista fija de intereses |
| seguidores | number | contador |
| siguiendo | number | contador |
| totalMeGusta | number | suma de me gusta de sus fotos |
| totalDesbloqueos | number | suma de desbloqueos de sus fotos |
| totalIntentos | number | intentos de trivia en sus fotos |
| totalFallos | number | fallos en sus fotos |
| porcentajeMeGusta | number \| null | null hasta 20 desbloqueos ("Nuevo") |
| porcentajeFallos | number | dificultad, 0–100 |
| numPublicaciones | number | publicaciones aprobadas (define el orden de la siguiente) |
| precioMinimo | number \| null | el precio más bajo de sus fotos ("desde N" en el feed) |
| esCreador | boolean | true desde su primera publicación aprobada (el feed solo muestra creadores) |
| ultimaPublicacionEn | Timestamp \| null | para el filtro "Siguiendo" |
| esVip | boolean | lo recalcula Functions |
| identidadVerificada | boolean | lo pone Functions (Stripe Connect) |
| creadoEn | Timestamp | |

### Unicidad del nombre: usernames/{usernameLower}
`{ uid }`. Solo Functions. Se crea en la misma transacción que `users/{uid}`.

## private/{uid} — datos privados
Lectura: solo el dueño. Escritura: solo Functions.

| Campo | Tipo |
|---|---|
| nombreReal | string |
| fechaNacimiento | string `AAAA-MM-DD` |
| correo | string |
| monedas | number — total (compradas + regalo) |
| monedasRegalo | number — parte de `monedas` que es de regalo (empieza en 100) |
| vidas | number (0–3) |
| vidasVuelvenEn | Timestamp \| null |
| vidasDia | string \| null — día del juego en que gastó su última vida |
| ajustes | map de booleanos (notificaciones y privacidad); se cambia con `guardarAjustes` |
| gananciasDisponibles | number (milésimas) |
| gananciasEnEspera | number (milésimas) |
| stripeCuentaId | string \| null |

### private/{uid}/ganancias/{id} — movimientos en espera
`{ milesimas, postId, liberaEn: Timestamp, liberado: boolean, creadoEn }`. Solo Functions; lectura del dueño.
Una función diaria pasa a disponible lo que cumplió 7 días.

## posts/{postId}
Lectura: usuarios registrados si `estado == "aprobada"` y no `oculta`; el creador siempre. Escritura: solo Functions.

| Campo | Tipo | Notas |
|---|---|---|
| creadorId | string | uid |
| orden | number \| null | 0, 1, 2… dentro de la fila del creador; se asigna al aprobarla |
| tipo | "foto" \| "video" | |
| precio | number | monedas; foto 1–20, video 3–20 (VIP hasta 100) |
| tiempo | number | segundos = min(30, 10 + 5·(precio−1)) |
| estado | "subiendo" \| "revision" \| "aprobada" \| "rechazada" | "subiendo" hasta que llega el archivo |
| motivoRechazo | string | si se rechazó |
| monedasGastadas | number | monedas compradas gastadas en ver la respuesta (las que le pagan al creador) |
| monedasRegalo | number | monedas de regalo gastadas en esta foto (no se pagan) |
| oculta | boolean | true con 3+ reportes, hasta revisión |
| rutaOriginal | string | `originales/{creadorId}/{postId}` |
| rutaBorrosa | string \| null | `borrosas/{postId}.jpg` |
| meGusta | number | |
| desbloqueos | number | |
| fallos | number | |
| intentos | number | |
| reportes | number | |
| comentarios | number | |
| creadoEn | Timestamp | |

### posts/{postId}/preguntas/0
**Nadie** la lee desde el cliente. Solo Functions.
`{ texto, opciones: string[3], correcta: number (0–2), autor: "creador" }`. Una sola pregunta por foto.

### bancoPreguntas/{id}
Preguntas generales de Nivel para cuando un jugador falla y ya no quedan preguntas de otras fotos del creador.
`{ texto, opciones: string[3], correcta, activa: boolean, aleatorio: number (0–1, para elegir al azar) }`. Nadie la lee desde el cliente. Se carga con `npm run banco` desde `functions/scripts/banco.json`.

### posts/{postId}/meGusta/{uid}
`{ creadoEn }`. Lectura: registrados. Escritura: solo Functions (para mantener contadores).

### posts/{postId}/comentarios/{id}
`{ autorId, username, texto, creadoEn }`. Lectura: quien desbloqueó la foto y el creador. Escritura: solo Functions.

## users/{uid}/desbloqueos/{postId}
`{ creadorId, orden, via: "acierto" | "pago", monedas, monedasRegalo, creadoEn }`. Lectura: dueño. Escritura: solo Functions.
Su existencia da acceso a la foto original en Storage.

## users/{uid}/progreso/{creadorId}
`{ siguienteOrden: number, vistas: string[], actualizadoEn }`. `vistas` = preguntas que ya le salieron de ese creador (`p:<postId>` o `b:<idBanco>`), para no repetirlas. Lectura: dueño. Solo Functions.
El jugador solo puede jugar el post con `orden == siguienteOrden`.

## users/{uid}/intentos/{postId}
`{ creadorId, preguntasUsadas: number (0–3), ultimoDia: "AAAA-MM-DD", inicioEn: Timestamp | null, preguntaActual: "p:<postId>" | "b:<idBanco>" | null, ordenOpciones: number[] | null, pendiente: boolean, resultado: "acierto" | "fallo" | "tiempo" | "pago" | null }`.
Lectura: dueño. Solo Functions.

## users/{uid}/siguiendo/{creadorId}
`{ creadoEn }`. Lectura: registrados. Solo Functions (mantiene el contador `seguidores`).

## reportes/{id}
Id: `{postId}_{uid}` (un reporte por persona y foto). `{ postId, autorId, motivo: "inapropiado" | "menor" | "robada" | "respuesta" | "otro", detalle, estado: "abierto" | "cerrado", creadoEn }`.
Nadie lo lee desde el cliente. Solo Functions.

## compras/{stripeSessionId}
`{ uid, paqueteId, monedas, montoCentavos, estado: "pagada" | "reembolsada" | "disputa", creadoEn }`.
Lectura: el comprador. Solo Functions (webhook de Stripe, idempotente por id de sesión).

## retiros/{id}
`{ uid, montoMilesimas, comisionMilesimas, netoMilesimas, stripeTransferId, estado, creadoEn }`.
Lectura: el dueño. Solo Functions.

## Storage
| Ruta | Lectura | Escritura |
|---|---|---|
| `originales/{creadorId}/{postId}` | el creador, o quien tenga `users/{uid}/desbloqueos/{postId}` | el creador, una vez, si el post está en "subiendo" y el tipo coincide (≤ 50 MB). Functions lo reemplaza por una copia sin metadatos |
| `borrosas/{postId}.jpg` | usuarios registrados | solo Functions |
| `avatares/{uid}.jpg` | usuarios registrados | el dueño (imagen ≤ 5 MB) |
