# Reglas del juego · Nivel

Estas reglas mandan sobre todo el proyecto. Si el código y este archivo no coinciden, se corrige el código.

## Usuarios
- Cualquier usuario juega y publica. Solo mayores de 18.
- En público solo se ve el nombre de usuario y la foto de perfil. Nombre real y fecha de nacimiento son privados.

## Niveles y trivia
- Cada foto es un nivel. Las fotos de un creador forman una sola fila y se juegan en orden, sin saltar.
- En el feed, la foto se ve borrosa. Para verla: acertar una trivia de 3 opciones con tiempo límite, o pagar.
- Tiempo según el precio: 10 segundos con 1 moneda, 5 segundos más por cada moneda extra, tope de 30 segundos.
- Cada foto tiene 3 preguntas distintas: la del creador y dos más (escritas por él o generadas por IA si marca la casilla).
- Un intento por día por foto. Si falla, al día siguiente le toca la siguiente pregunta; nunca se repiten. Tras fallar las 3, solo puede pagar.
- El botón "Ver respuesta · N monedas" está siempre visible. Al pagar, se muestra la respuesta correcta sobre la foto unos 3 segundos y la foto queda desbloqueada.
- Una foto desbloqueada (acertando o pagando) queda en la colección del usuario para siempre.

## Vidas
- Cada jugador tiene 3 vidas al día. Cada fallo (o tiempo agotado) gasta una.
- Al perder las 3, el juego se bloquea en todos los perfiles durante 24 horas, salvo pagando con monedas.
- Las fotos ya desbloqueadas se pueden seguir viendo.

## Publicaciones
- Precio por publicación: mínimo 1 moneda por foto y 3 por video. Máximo 20 para creadores normales y 100 para VIP.
- VIP es automático: 5.000 seguidores o más, identidad verificada y 80% o más de me gusta.
- Se sube una sola foto o video a la vez. Videos de máximo 30 segundos.
- Toda publicación pasa por revisión antes de mostrarse.
- Cada foto tiene botón de reportar: contenido inapropiado, posible menor, foto robada o sin permiso, respuesta incorrecta, otro.

## Estadísticas
- % de me gusta del creador = total de me gusta ÷ total de desbloqueos de sus fotos. No se muestra hasta tener un mínimo de 20 desbloqueos ("Nuevo").
- Dificultad del creador = % de intentos fallidos.

## Feed
- Filtros: Siguiendo (solo creadores seguidos con fotos nuevas), Más difíciles, Populares, Para ti (cruce de intereses), Nuevos.

## Monedas y dinero
- Paquetes: 100 por $0.99; 550 por $4.99 (+10%); 1.150 por $9.99 (+15%); 2.400 por $19.99 (+20%). Las monedas no caducan.
- Pago al creador: 5 milésimas de dólar ($0.005) por cada moneda gastada en sus publicaciones.
- Lo ganado queda "en espera" 7 días antes de estar disponible.
- Retiro mínimo: $50. La comisión del retiro ($2 + 0.25% + $0.25) se descuenta al creador.
- El dinero se guarda en milésimas de dólar (enteros): 1 moneda gastada = 5 milésimas.

## Reglas técnicas
- La lógica del juego (vidas, monedas, desbloqueos, progreso, intentos, contadores, ganancias) se ejecuta SOLO en Cloud Functions. El cliente nunca la escribe.
- Las preguntas y respuestas nunca se leen desde el cliente.
- Este proyecto no tiene nada que ver con Gold Up. No se toca ningún proyecto de Firebase existente.
