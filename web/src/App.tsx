import { useEffect, useState } from "react";
import { signInAnonymously } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { auth, db, usaEmuladores } from "./firebase";

// Pantalla provisional de la Fase 1: comprueba la conexión con Firebase
// listando los creadores cargados por el script de datos de prueba.
// Las pantallas del prototipo se construyen en la Fase 2.

type Creador = { id: string; username: string; seguidores: number; porcentajeFallos: number };

export default function App() {
  const [creadores, setCreadores] = useState<Creador[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (!auth.currentUser) await signInAnonymously(auth);
        const snap = await getDocs(query(collection(db, "users"), orderBy("seguidores", "desc")));
        setCreadores(
          snap.docs.map((d) => ({
            id: d.id,
            username: d.get("username"),
            seguidores: d.get("seguidores") ?? 0,
            porcentajeFallos: d.get("porcentajeFallos") ?? 0,
          })),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <main>
      <p className="marca">Nivel</p>
      <p className="sub">{usaEmuladores ? "Conectado a los emuladores locales" : "Conectado a Firebase"}</p>
      {error && <p className="aviso">No se pudo leer Firestore: {error}</p>}
      {creadores === null && !error && <p className="sub">Cargando…</p>}
      {creadores?.length === 0 && (
        <p className="aviso">No hay creadores. Carga los datos de prueba con <code>npm run seed</code>.</p>
      )}
      {creadores?.map((c) => (
        <div className="card" key={c.id}>
          <span className="name">@{c.username}</span>
          <span className="tag">
            {c.seguidores.toLocaleString("es")} seguidores · {c.porcentajeFallos}% fallos
          </span>
        </div>
      ))}
    </main>
  );
}
