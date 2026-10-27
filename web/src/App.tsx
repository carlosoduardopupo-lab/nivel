import { useCallback, useEffect, useState } from "react";
import { Cargando } from "./componentes";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { auth, db } from "./firebase";
import { renovarPush } from "./avisos";
import { ProveedorNav, useNav } from "./nav";
import { Ajustes } from "./pantallas/Ajustes";
import { Crear } from "./pantallas/Crear";
import { Creador } from "./pantallas/Creador";
import { Feed, elegirFiltroInicial } from "./pantallas/Feed";
import { Perfil } from "./pantallas/Perfil";
import { CrearReel, Reels } from "./pantallas/Reels";
import { Registro } from "./pantallas/Registro";
import { Retiro, Tienda } from "./pantallas/Tienda";
import { ProveedorSesion, useSesion } from "./sesion";

/** Abre el perfil de un enlace compartido (/?u=usuario) y limpia la dirección. */
function EnlaceCompartido() {
  const { ir } = useNav();
  // Con permiso de avisos ya concedido, renueva el token de este dispositivo.
  useEffect(() => { renovarPush(); }, []);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    // Enlaces de las notificaciones: /?ir=perfil|reels|feed
    const destino = params.get("ir");
    if (destino) {
      history.replaceState(null, "", location.pathname);
      if (destino === "perfil") ir({ n: "perfil" });
      else if (destino === "reels") ir({ n: "reels" });
      return;
    }
    if (params.has("ref")) history.replaceState(null, "", location.pathname + (params.has("u") ? `?u=${encodeURIComponent(params.get("u")!)}` : ""));
    const u = params.get("u")?.trim().toLowerCase().replace(/^@/, "");
    if (!u) return;
    history.replaceState(null, "", location.pathname);
    getDocs(query(collection(db, "users"), where("username", "==", u), limit(1))).then((s) => {
      const d = s.docs[0];
      if (d) ir(d.id === auth.currentUser?.uid ? { n: "perfil" } : { n: "creador", id: d.id });
    }, () => {});
  }, [ir]);
  return null;
}

function Contenido() {
  const { cargando, usuario, perfil } = useSesion();
  // El registro se queda abierto hasta su último paso aunque el perfil ya exista.
  const [registrando, setRegistrando] = useState(false);
  useEffect(() => {
    if (!cargando && (!usuario || !perfil)) setRegistrando(true);
  }, [cargando, usuario, perfil]);
  const terminar = useCallback((cuentaNueva: boolean) => {
    // Al terminar el registro, el feed empieza en "Para ti".
    if (cuentaNueva) elegirFiltroInicial("Para ti");
    setRegistrando(false);
  }, []);

  if (cargando) return <main id="view" className="screen"><Cargando /></main>;
  if (registrando || !usuario || !perfil) {
    return <main id="view" className="screen"><Registro key={usuario?.uid ?? "anon"} alTerminar={terminar} /></main>;
  }

  return (
    <ProveedorNav>
      {(p) => <><EnlaceCompartido />{(() => {
        switch (p.n) {
          case "feed": return <Feed />;
          case "creador": return <Creador key={p.id + (p.postId ?? "")} id={p.id} postId={p.postId} />;
          case "reels": return <Reels key={(p.autorId ?? "") + (p.reelId ?? "")} autorId={p.autorId} reelId={p.reelId} />;
          case "crearReel": return <CrearReel />;
          case "perfil": return <Perfil />;
          case "crear": return <Crear />;
          case "tienda": return <Tienda />;
          case "retiro": return <Retiro />;
          case "ajustes": return <Ajustes />;
        }
      })()}</>}
    </ProveedorNav>
  );
}

export default function App() {
  return (
    <div id="app">
      <ProveedorSesion>
        <Contenido />
      </ProveedorSesion>
    </div>
  );
}
