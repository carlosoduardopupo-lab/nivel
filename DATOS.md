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
| numPublicaciones | number | publicaciones aprobadas visibles |
| siguienteOrden | number | nivel que recibirá la próxima aprobada (no baja al eliminar; si falta, se usa numPublicaciones) |
| precioPromedio | number \| null | precio promedio (redondeado) de sus publicaciones visibles ("≈ N 🪙" en el feed) |
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
| monedas | number — saldo total (compradas + regalo) |
| monedasRegalo | number — parte de `monedas` que es regalo de bienvenida; se gasta primero y no paga al creador |
| vidas | number (0–3) |
| vidasVuelvenEn | Timestamp \| null |
| vidasDia | string \| null — día del juego en que gastó su última vida |
| ajustes | map de booleanos (notificaciones y privacidad, y `escaparate`: salir en la web pública); se cambia con `guardarAjustes` |
| gananciasDisponibles | number (milésimas) |
| gananciasEnEspera | number (milésimas) |
| stripeCuentaId | string \| null |
| referidoPor | string \| null — uid de quien lo invitó |
| referidoContado | boolean — si su invitación ya contó (jugó su primera foto) |
| vidasReferidoDia | string \| null — día en que recibió su última recarga de vidas por un amigo (máx. una al día) |
| referidos | number — usuarios que se registraron con su enlace |
| monedasGanadas | number — fase de prueba: monedas gastadas en sus fotos que se le sumaron |
| monedasReferidos | number — monedas ganadas por referidos (tope 1.000) |

### private/{uid}/notificaciones/{id}
`{ tipo: "nuevas" | "vidas" | "comentarios" | "ganancias", titulo, texto, url, de?, leida, creadoEn }`. Lectura: dueño. Solo Functions (`marcarLeidas` las marca como leídas).

### private/{uid}/dispositivos/{token}
`{ creadoEn }`. Tokens de push (FCM) de sus dispositivos. Solo Functions; los caducados se borran al enviar.

### private/{uid}/referidos/{uidNuevo}
`{ estado: "pendiente" | "contado", monedas, recargaVidas, creadoEn, contadoEn }`. Solo Functions. Se crea "pendiente" al registrarse el invitado y pasa a "contado" cuando juega su primera foto.

### private/{uid}/ganancias/{id} — movimientos en espera
`{ milesimas, postId, liberaEn: Timestamp, liberado: boolean, creadoEn }`. Solo Functions; lectura del dueño.
Una función diaria pasa a disponible lo que cumplió 7 días.

## posts/{postId}
Lectura: usuarios registrados si `estado == "aprobada"` y no `oculta`; el creador siempre; quien la desbloqueó, siempre. Escritura: solo Functions.

| Campo | Tipo | Notas |
|---|---|---|
| creadorId | string | uid |
| orden | number \| null | 0, 1, 2… dentro de la fila del creador; se asigna al aprobarla |
| tipo | "foto" \| "video" | |
| precio | number | monedas; foto 1–20, video 3–20 (VIP hasta 100) |
| tiempo | number | segundos = min(30, 10 + 5·(precio−1)) |
| estado | "subiendo" \| "revision" \| "aprobada" \| "rechazada" \| "eliminada" | "subiendo" hasta que llega el archivo; "eliminada" si el creador la eliminó y alguien ya la había desbloqueado |
| motivoRechazo | string | si se rechazó |
| monedasRecibidas | number | todas las monedas pagadas por ver la respuesta (incluidas las de regalo) |
| monedasGastadas | number | monedas compradas gastadas en ver la respuesta (sin las de regalo) |
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

### posts/{postId}/preguntas/{n} (n = 0; las publicaciones antiguas pueden tener 0, 1, 2)
**Nadie** la lee desde el cliente. Solo Functions.
`{ texto, opciones: string[3], correcta: number (0–2), autor: "creador" | "ia" }`.
La pregunta 0 es siempre la del creador.

### posts/{postId}/meGusta/{uid}
`{ creadoEn }`. Lectura: registrados. Escritura: solo Functions (para mantener contadores).

### posts/{postId}/comentarios/{id}
`{ autorId, username, texto, creadoEn }`. Lectura: quien desbloqueó la foto y el creador. Escritura: solo Functions.

## users/{uid}/desbloqueos/{postId}
`{ creadorId, orden, via: "acierto" | "pago", monedas, creadoEn }`. Lectura: dueño. Escritura: solo Functions.
Su existencia da acceso a la foto original en Storage.

## users/{uid}/progreso/{creadorId}
`{ siguienteOrden: number, actualizadoEn }`. Lectura: dueño. Solo Functions.
El jugador solo puede jugar el post con `orden == siguienteOrden`.

## users/{uid}/intentos/{postId}
`{ creadorId, preguntasUsadas: number (0–3), ultimoDia: "AAAA-MM-DD", inicioEn: Timestamp | null, preguntaActual: number | null, ordenOpciones: number[] | null, pendiente: boolean, resultado: "acierto" | "fallo" | "tiempo" | "pago" | null }`.
Lectura: dueño. Solo Functions.

## users/{uid}/bloqueados/{otroId}
`{ creadoEn }`. Lectura: solo el dueño. Solo Functions (`bloquear`).

## problemas/{id}
`{ autorId, username, texto, estado: "abierto" | "resuelto", creadoEn }`. Reportes de problemas desde Ajustes. Nadie lo lee desde el cliente.

## users/{uid}/siguiendo/{creadorId}
`{ creadorId, creadoEn }` (`creadorId` para avisar a los seguidores de un creador). Lectura: registrados. Solo Functions (mantiene el contador `seguidores`).

## reportes/{id}
Id: `{postId}_{uid}` (un reporte por persona y foto) o `reel_{reelId}_{uid}` con `tipo: "reel"` para reels. `{ postId, autorId, motivo: "inapropiado" | "menor" | "robada" | "respuesta" | "otro", detalle, estado: "abierto" | "cerrado", creadoEn }`.
Nadie lo lee desde el cliente. Solo Functions.

## compras/{stripeSessionId}
`{ uid, paqueteId, monedas, montoCentavos, estado: "pagada" | "reembolsada" | "disputa", creadoEn }`.
Lectura: el comprador. Solo Functions (webhook de Stripe, idempotente por id de sesión).

## retiros/{id}
`{ uid, montoMilesimas, comisionMilesimas, netoMilesimas, stripeTransferId, estado, creadoEn }`.
Lectura: el dueño. Solo Functions.

## estadisticas/{AAAA-MM-DD}
Contadores del día: `registros, activos, intentos, aciertos, pagos, monedasGastadas, publicaciones, reels, comentarios, seguimientos, referidos, compartidos, instalaciones, visitasDescarga, descargasApk, actualizadoEn`. Lectura: solo administradores. Solo Functions (`functions/src/estadisticas.ts`). `private/{uid}.ultimaVisita` evita contar dos veces al mismo usuario activo en un día.

## bancoPreguntas/{id}
`{ texto, opciones: string[3], correcta: 0, activa, aleatorio }`. Preguntas generales cargadas con `npm run banco` desde `functions/scripts/banco.json`. Nadie las lee desde el cliente. Por ahora el juego publicado no las usa.

## reels/{reelId}
Lectura: registrados si `estado == "publicado"`; el autor siempre. Escritura: solo Functions (`crearReel`, `editarReel`, `eliminarReel`, `meGustaReel`).

| Campo | Tipo | Notas |
|---|---|---|
| autorId | string | uid |
| texto | string | hasta 150 caracteres, puede ir vacío |
| estado | "subiendo" \| "publicado" \| "revision" \| "rechazado" \| "oculto" | "subiendo" hasta que se procesa el video; "oculto" con 3 reportes |
| rutaVideo | string \| null | `reels/{autorId}/{reelId}` (mp4 sin metadatos, con token para streaming) |
| rutaPortada | string \| null | `portadas-reels/{reelId}.jpg` |
| duracion | number \| null | segundos (máx. 60) |
| meGusta | number | |
| creadoEn | Timestamp | |

### reels/{reelId}/meGusta/{uid}
`{ creadoEn }`. Lectura: registrados. Solo Functions.

## Storage
| Ruta | Lectura | Escritura |
|---|---|---|
| `originales/{creadorId}/{postId}` | el creador, o quien tenga `users/{uid}/desbloqueos/{postId}` | el creador, una vez, si el post está en "subiendo" y el tipo coincide (≤ 50 MB). Functions lo reemplaza por una copia sin metadatos |
| `borrosas/{postId}.jpg` | usuarios registrados | solo Functions |
| `reels/{autorId}/{reelId}` | registrados | el autor, una vez, si el reel está "subiendo" (video ≤ 100 MB) |
| `portadas-reels/{reelId}.jpg` | registrados | solo Functions |
| `avatares/{uid}.jpg` | usuarios registrados | el dueño (imagen ≤ 5 MB) |
