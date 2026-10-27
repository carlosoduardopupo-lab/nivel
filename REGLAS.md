# Reglas del juego · Blurry

Estas reglas mandan sobre todo el proyecto. Si el código y este archivo no coinciden, se corrige el código.

## Usuarios
- Cualquier usuario juega y publica. Solo mayores de 18.
- En público solo se ve el nombre de usuario y la foto de perfil. Nombre real y fecha de nacimiento son privados.

## Niveles y trivia
- Cada foto es un nivel. Las fotos de un creador forman una sola fila y se juegan en orden, sin saltar.
- En el feed, la foto se ve borrosa. Para verla: acertar una trivia de 3 opciones con tiempo límite, o pagar.
- Tiempo según el precio: 10 segundos con 1 moneda, 5 segundos más por cada moneda extra, tope de 30 segundos.
- Cada foto tiene una sola pregunta, escrita por el creador. El creador puede editarla (texto y respuestas) cuando quiera desde su perfil.
- Un solo intento por foto. Si falla, solo puede pagar.
- El botón "Ver respuesta · N monedas" está siempre visible. Al pagar, la foto queda desbloqueada directamente (no se muestra la respuesta).
- Al abrir la foto que toca jugar, la pregunta empieza sola (sin pantalla previa).
- Una foto desbloqueada (acertando o pagando) queda en la colección del usuario para siempre.

## Vidas
- Cada jugador tiene 3 vidas al día. Cada fallo (o tiempo agotado) gasta una.
- Al perder las 3, el juego se bloquea en todos los perfiles durante 24 horas, salvo pagando con monedas.
- Las fotos ya desbloqueadas se pueden seguir viendo.

### Cómo se aplican (decisiones de implementación)
- El "día" se cuenta en la hora de Nueva York.
- La vida se gasta al **empezar** la pregunta y se devuelve si acierta a tiempo o paga antes de que se acabe el tiempo. Así, cerrar la app a mitad de una pregunta cuenta como fallo.
- Hay un margen de 2 segundos sobre el tiempo de la foto por la latencia de la red.
- Con alguna vida gastada (pero no las 3), las vidas vuelven a 3 al empezar un nuevo día. Al perder la tercera, el bloqueo dura 24 horas exactas.
- Pagar también exige que sea el siguiente nivel.
- El nivel de una foto se asigna al aprobarla. Las fotos ocultas por reportes se saltan en la fila.
- Me gusta y comentarios: solo quien desbloqueó la foto (y el creador comenta en las suyas).

## Publicaciones
- Precio por publicación: mínimo 1 moneda por foto y 3 por video. Máximo 20 para creadores normales y 100 para VIP.
- VIP es automático: 5.000 seguidores o más, identidad verificada y 80% o más de me gusta.
- Se sube una sola foto o video a la vez. Videos de máximo 30 segundos.
- Fase actual: toda publicación se aprueba sola al subirse (`APROBACION_AUTOMATICA` en `functions/src/reglas.ts`). Con la revisión activada, pasa por revisión antes de mostrarse.
- Solo el creador puede eliminar una publicación suya (botón "Eliminar publicación"). Sale del feed y nadie más puede jugarla ni pagarla; quien ya la desbloqueó (acertando o pagando) la conserva para siempre. Si nadie la había desbloqueado, se borra del todo.
- Cada foto tiene botón de reportar: contenido inapropiado, posible menor, foto robada o sin permiso, respuesta incorrecta, otro.

## Reels
- Videos gratis (sin trivia ni precio) para que los creadores se den a conocer e inviten a jugar. Hasta 60 segundos y 100 MB; texto opcional de hasta 150 caracteres.
- Se ven en la sección Reels (una tarjeta por pantalla, deslizando en vertical). Cada reel tiene me gusta, compartir y un botón "Jugar con @usuario" que lleva a sus fotos.
- En el feed, junto al "+", el icono de película lleva a Reels; en Reels, el mando lleva de vuelta al juego. El "+" crea una publicación en el juego y un reel en Reels.
- El autor puede editar el texto o eliminar el reel. Sus reels salen en una pestaña "Reels" de su perfil; los de otros, desde el botón de película de su perfil.
- Siguen la misma aprobación que las publicaciones (`APROBACION_AUTOMATICA`).

## Escaparate público (página de descarga)
- La página `/descargar` muestra en un teléfono el feed real de los creadores más populares (por me gusta), con su **primera foto visible nítida** como publicidad gratis: aparece borrosa y se aclara.
- Sale todo creador popular salvo que desactive "Aparecer en la web de Blurry" en Ajustes (`ajustes.escaparate`, activado por defecto).
- Solo se publica esa primera foto (reducida); nunca las demás fotos de su fila, preguntas ni respuestas. Lo sirve la función `escaparatePublico` en `/api/escaparate`.

## Notificaciones
- Campana en el feed con los avisos (se marcan como leídos al abrirla) y avisos push en el dispositivo si el usuario lo permite (Ajustes → Notificaciones → En este dispositivo, o desde la campana).
- Tipos y su interruptor en Ajustes: **fotos nuevas** de quien sigues (al aprobarse), **vidas** (cuando vuelven tras las 24 h y cuando un amigo invitado cuenta), **comentarios** en tus fotos/reels y respuestas a los tuyos (desactivado por defecto), **ganancias** (alguien desbloqueó tu foto pagando).
- No llegan avisos de usuarios bloqueados. En iPhone, el push solo funciona con Blurry añadida a la pantalla de inicio.
- Lógica en `functions/src/notificaciones.ts`; la tarea `avisarVidas` corre cada 15 minutos.

## Seguridad y cuenta
- **Bloquear**: desde el perfil de alguien (⋯) o un reel. Quien bloquea deja de ver sus fotos, reels, comentarios y en la búsqueda; se rompen los seguimientos en los dos sentidos y el bloqueado no puede seguirle ni comentar en sus fotos o reels. No se avisa. Se deshace en Ajustes → Cuentas bloqueadas.
- **Reportar reels**: como las fotos (inapropiado, menor, robado, otro); con 3 reportes de personas distintas el reel se oculta hasta revisarlo (`npm run moderar -- reels`).
- **Reportar un problema y Centro de ayuda** (Ajustes → Ayuda). Los problemas se guardan en `problemas` (`npm run moderar -- problemas`). Correo de soporte: blurrysupport@gmail.com.
- **Eliminar cuenta** (Ajustes, escribiendo ELIMINAR): se borran perfil, datos privados, monedas, colección, reels, comentarios, seguimientos, avatar, publicaciones y el acceso. Las fotos que otros ya desbloquearon quedan "eliminadas" en su colección.

## Estadísticas
- % de me gusta del creador = total de me gusta ÷ total de desbloqueos de sus fotos. No se muestra hasta tener un mínimo de 20 desbloqueos ("Nuevo").
- Dificultad del creador = % de intentos fallidos.

## Feed
- Filtros, en este orden: Nuevos (el que se abre por defecto), Siguiendo (solo creadores seguidos con fotos nuevas), Populares, Para ti (cruce de intereses). La barra se desplaza en horizontal.

## Monedas y dinero
- **Fase de prueba** (`FASE_PRUEBA` en `functions/src/reglas.ts` y `web/src/util.ts`): no hay compras ni retiros (los botones no aparecen; en su lugar, un aviso). Cuando alguien paga una foto, las monedas se le suman al creador como monedas de regalo (`monedasGanadas`) para probar el sistema; no generan dinero. El aviso dice que se avisará cuando empiece el sistema de pagos y que los seguidores sí son reales.
- Al crear la cuenta se regalan 100 monedas. Desbloquean fotos igual que las compradas, se gastan primero y no generan pago al creador.
- Referidos: el código de invitación es el nombre de usuario; va en todos los enlaces que comparte (`?ref=usuario`) y el amigo también puede escribirlo al registrarse. Un amigo **cuenta** cuando crea una cuenta nueva con ese código **y juega su primera foto** (empieza una pregunta o paga una foto); solo registrarse no da nada. Por cada amigo que cuenta, quien invitó recupera sus 3 vidas al momento (también quita el bloqueo de 24 h), **como máximo una recarga al día**. Cuando cuenta el tercer amigo gana 500 monedas una sola vez. Son monedas de regalo y no canjeables. Nunca cuenta la cuenta propia. Lógica en `functions/src/referidos.ts`.
- Paquetes: 150 por $1.99; 550 por $4.99 (+46%); 1.150 por $9.99 (+52%); 2.400 por $19.99 (+59%). Los porcentajes son monedas extra por dólar respecto al de 150 por $1.99. Las monedas no caducan.
- Pago al creador: 5 milésimas de dólar ($0.005) por cada moneda gastada en sus publicaciones.
- Lo ganado queda "en espera" 7 días antes de estar disponible.
- Retiro mínimo: $50. La comisión del retiro ($2 + 0.25% + $0.25) se descuenta al creador.
- El dinero se guarda en milésimas de dólar (enteros): 1 moneda gastada = 5 milésimas.

## Reglas técnicas
- La lógica del juego (vidas, monedas, desbloqueos, progreso, intentos, contadores, ganancias) se ejecuta SOLO en Cloud Functions. El cliente nunca la escribe.
- Las preguntas y respuestas nunca se leen desde el cliente.
- Este proyecto no tiene nada que ver con Gold Up. No se toca ningún proyecto de Firebase existente.
