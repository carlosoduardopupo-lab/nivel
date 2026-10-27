# Nivel

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
npm run seed              # terminal 2: carga 6 creadores y un jugador de prueba
npm run web               # terminal 2: la web en http://localhost:5173
```
Jugador de prueba: `luna@nivel.test` / `nivel1234`. Los creadores: `<usuario>@nivel.test` / `nivel1234`.

`npm run emuladores` guarda los datos en `emulator-data/` al cerrar; `npm run emuladores:limpio` arranca vacío.

## Pruebas
```bash
npm run test:reglas       # arranca Firestore y Storage emulados y ejecuta tests/
```

## Proyecto de Firebase real
`.firebaserc` apunta a `demo-nivel` (solo emuladores). Cuando exista el proyecto en la nube:
```bash
firebase use --add        # elige el proyecto y ponle el alias "prod"
```
Nada se despliega sin confirmación.
