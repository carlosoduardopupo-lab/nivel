# Blurry

(El repositorio y los nombres internos siguen siendo "nivel".)

Juego social de trivias y fotos. React + Vite + TypeScript, Firebase (Auth, Firestore, Storage, Functions, Hosting) y Stripe.
Proyecto independiente: no tiene nada que ver con Gold Up.

- `REGLAS.md`: reglas del juego (mandan sobre todo).
- `DATOS.md`: modelo de datos de Firestore y Storage.
- `prototipo.html`: referencia visual y de flujo.

## Requisitos
- Node 22 y Java 21 (los emuladores lo necesitan).
- `npm i -g firebase-tools`

## Arrancar en local (sin nube)
```bash
npm install
npm --prefix functions install && npm --prefix functions run build
npm --prefix web install

npm run emuladores        # terminal 1: emuladores (UI en http://localhost:4000)
npm run seed              # terminal 2: carga 6 creadores (34 fotos) y un jugador de prueba
npm run web               # terminal 2: la web en http://localhost:5173
```
Si cambias algo en `functions/src`, vuelve a ejecutar `npm --prefix functions run build` (o deja `npm --prefix functions run build:watch` abierto).
Jugador de prueba: `luna@nivel.test` / `nivel1234`. Los creadores: `<usuario>@nivel.test` / `nivel1234`.

`npm run emuladores` guarda los datos en `emulator-data/` al cerrar; `npm run emuladores:limpio` arranca vacío.

## Moderación manual
Toda publicación nueva queda "En revisión" hasta que la apruebes:
```bash
npm run moderar -- lista              # publicaciones en revisión
npm run moderar -- aprobar <postId>
npm run moderar -- rechazar <postId> motivo
npm run moderar -- ocultas            # ocultadas por 3 reportes
npm run moderar -- mostrar <postId>
```
Añade `--nube` para hacerlo sobre el proyecto real (`blurry-78f0d`). Usa tu sesión de gcloud; si caduca:
```bash
gcloud auth application-default login
```

## Pruebas
```bash
npm test                  # todo
npm run test:reglas       # reglas de Firestore y Storage (tests/)
npm run test:juego        # empezarPregunta, responder y pagarRespuesta (functions/test/)
```

## Proyecto de Firebase real
`.firebaserc` tiene `demo-nivel` (solo emuladores) por defecto y el alias `prod` = `blurry-78f0d` (https://blurry-78f0d.web.app).
La configuración de la web de producción está en `web/.env.production` (no se sube a git).
```bash
npm --prefix web run build
firebase deploy --project prod
```
Las reglas de Storage leen Firestore, así que el agente de Storage necesita este permiso (una sola vez):
```bash
gcloud projects add-iam-policy-binding blurry-78f0d --member="serviceAccount:service-893966626136@gcp-sa-firebasestorage.iam.gserviceaccount.com" --role="roles/firebaserules.firestoreServiceAgent" --condition=None
```
La web descarga las fotos con `getBlob`, que necesita CORS en el bucket (configurado en `storage-cors.json`):
```bash
gcloud storage buckets update gs://blurry-78f0d.firebasestorage.app --cors-file=storage-cors.json
```
Nada se despliega sin confirmación.

## App de Android (APK)
Página de descarga: https://blurry-78f0d.web.app/descargar (`web/public/descargar/index.html`, HTML suelto). Detecta Android (APK + instalar desde el navegador), iPhone (pasos para añadir a inicio) y ordenador. Admite `?ref=usuario` y lo pasa a la app. Las fotos son de Unsplash (licencia libre, enlazadas).

`android/` es una Trusted Web Activity (generada con Bubblewrap): abre https://blurry-78f0d.web.app como app.
El APK se publica en https://blurry-78f0d.web.app/blurry.apk y Android lo verifica con `web/public/.well-known/assetlinks.json`.

**La firma** está en `android/blurry.keystore` y su contraseña en `android/clave-firma.local`. Ninguno se sube a git:
guárdalos en un lugar seguro. Sin ellos no se puede publicar una actualización de la app.

Recompilar (Java 17 en `~/.bubblewrap/jdk-17…`, SDK de Android en `%LOCALAPPDATA%\Android\Sdk`):
```bash
cd android && JAVA_HOME=~/.bubblewrap/jdk-17.0.20.1+1 ./gradlew assembleRelease
```
Luego `zipalign` y `apksigner sign --ks blurry.keystore --ks-key-alias blurry` (build-tools 35), y copia el APK a `web/public/blurry.apk`.
Sube `appVersionCode` en `android/app/build.gradle` en cada versión nueva.
