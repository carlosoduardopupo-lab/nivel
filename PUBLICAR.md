# Publicar Nivel en internet

Al terminar, la app estará en **https://nivel-juego.web.app** (o el nombre que te asigne Firebase) y podrás abrirla desde el teléfono.
Todavía sin Stripe: los usuarios juegan con sus 3 vidas y sus 100 monedas de regalo.

## 1. Crear el proyecto (consola de Firebase, una sola vez)

1. Entra a https://console.firebase.google.com y pulsa **Crear un proyecto**.
2. Nombre: `nivel-juego`. Si el id queda distinto (p. ej. `nivel-juego-1a2b3`), anótalo: lo necesitas en el paso 3.
3. Google Analytics: no hace falta.
4. Abajo a la izquierda pulsa **Actualizar** y elige el plan **Blaze** (pago por uso). Las Cloud Functions lo exigen.
   - En Google Cloud, ve a **Facturación → Presupuestos y alertas** y crea una alerta de **$10**.
5. **Authentication → Comenzar**. En "Métodos de acceso" activa **Correo electrónico/contraseña** y **Google**.
6. **Firestore Database → Crear base de datos** → ubicación **nam5 (us-central)** → modo producción.
7. **Storage → Comenzar** → misma ubicación → modo producción.

## 2. Preparar tu PC (una sola vez)

En PowerShell, dentro de la carpeta `nivel`:

```
git pull
npm install
npm --prefix functions install
npm --prefix web install
firebase login
```

## 3. Si el id del proyecto no es exactamente `nivel-juego`

Abre `.firebaserc` y cambia `"prod": "nivel-juego"` por tu id. Haz lo mismo en `cors.json` (las dos direcciones `https://...`).

## 4. Publicar

```
npm run publicar
```

Sube la web, las funciones, las reglas de seguridad y los índices. La primera vez tarda unos minutos y puede preguntarte si activar algunas APIs: responde que sí.

Las siguientes veces, si solo cambió la web: `npm run publicar:web`.

## 5. Dos ajustes finales (una sola vez)

**Permitir que las fotos carguen en la web (CORS).** En la consola de Google Cloud abre **Cloud Shell** (icono `>_` arriba a la derecha), sube el archivo `cors.json` (menú ⋮ → Subir) y ejecuta:

```
gsutil cors set cors.json gs://nivel-juego.firebasestorage.app
```

(Cambia `nivel-juego` por tu id si es distinto. El nombre exacto del bucket aparece en Firebase → Storage.)

**Cargar el banco de preguntas.** En tu PC:

```
gcloud auth application-default login
set GCLOUD_PROJECT=nivel-juego
npm run banco -- --nube
```

(Si no tienes `gcloud`, instálalo desde https://cloud.google.com/sdk/docs/install.)

## 6. Aprobar publicaciones

Cada foto nueva queda "En revisión". Para verlas y aprobarlas (con la misma sesión de `gcloud` del paso 5):

```
npm run moderar -- lista --nube
npm run moderar -- aprobar <id> --nube
```

## Qué falta antes de abrirla al público

- Términos de uso y política de privacidad (la app los menciona en el registro).
- Un correo de soporte.
- Moderación automática de fotos (fase 4); mientras tanto revisa a mano cada publicación.
- Eliminar cuenta (la pantalla dice "próximamente").
