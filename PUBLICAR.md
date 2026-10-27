# Publicar Blurry

Proyecto real: **blurry-78f0d** (alias `prod` en `.firebaserc`). Dominio: **playblurry.com** (Porkbun; DNS: A `199.36.158.100`, TXT `hosting-site=blurry-78f0d`, CNAME `www` → `blurry-78f0d.web.app`). `www` redirige al dominio principal.
- App: https://playblurry.com (también https://blurry-78f0d.web.app)
- Página de descarga: https://blurry-78f0d.web.app/descargar (enlace corto: https://playblurry.com/download)

## Publicar cambios
```bash
npm run publicar        # functions + web + reglas + índices + los dos sitios de Hosting
npm run publicar:web    # solo la web (los dos sitios de Hosting)
```
Si el despliegue de Functions falla con "User code failed to load … Timeout", repítelo con
`FUNCTIONS_DISCOVERY_TIMEOUT=60000` delante.

La web lee la configuración de Firebase de `web/.env.production` (no está en git); si no existe,
la toma de `/__/firebase/init.json` en Hosting.

## Configuración que se hace una sola vez (ya hecha en blurry-78f0d)
- **CORS de Storage** (para que las fotos carguen en la web):
  `gcloud storage buckets update gs://blurry-78f0d.firebasestorage.app --cors-file=cors.json`
- **Permiso de Storage para leer Firestore** (las reglas de Storage lo necesitan):
  `gcloud projects add-iam-policy-binding blurry-78f0d --member="serviceAccount:service-893966626136@gcp-sa-firebasestorage.iam.gserviceaccount.com" --role="roles/firebaserules.firestoreServiceAgent" --condition=None`
- **Sitios de Hosting**: `app` → blurry-78f0d y `juego` → blurry-game (`firebase target:apply`, ver `.firebaserc`).

## Moderación y datos
- `npm run moderar -- lista --nube` (usa tu sesión de `gcloud auth application-default login`).
- Banco de preguntas: `npm run banco -- --nube` (ver README).

## App de Android
Ver la sección "App de Android (APK)" del README. La clave de firma (`android/blurry.keystore`
y `android/clave-firma.local`) no está en git: guárdala en un lugar seguro.
