import { useCallback, useEffect, useState } from "react";
import { Cargando } from "./componentes";
import { ProveedorNav } from "./nav";
import { Ajustes } from "./pantallas/Ajustes";
import { Crear } from "./pantallas/Crear";
import { Creador } from "./pantallas/Creador";
import { Feed, elegirFiltroInicial } from "./pantallas/Feed";
import { Perfil } from "./pantallas/Perfil";
import { Registro } from "./pantallas/Registro";
import { Retiro, Tienda } from "./pantallas/Tienda";
import { ProveedorSesion, useSesion } from "./sesion";

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
      {(p) => {
        switch (p.n) {
          case "feed": return <Feed />;
          case "creador": return <Creador key={p.id + (p.postId ?? "")} id={p.id} postId={p.postId} />;
          case "perfil": return <Perfil />;
          case "crear": return <Crear />;
          case "tienda": return <Tienda />;
          case "retiro": return <Retiro />;
          case "ajustes": return <Ajustes />;
        }
      }}
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
