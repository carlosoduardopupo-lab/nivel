import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type Pantalla =
  | { n: "feed" }
  | { n: "creador"; id: string; postId?: string }
  | { n: "perfil" }
  | { n: "crear" }
  | { n: "tienda" }
  | { n: "retiro" }
  | { n: "ajustes" };

type Nav = {
  actual: Pantalla;
  ir: (p: Pantalla) => void;
  volver: () => void;
  reiniciar: (p: Pantalla) => void;
  abrirHoja: (contenido: ReactNode) => void;
  cerrarHoja: () => void;
  aviso: (t: string) => void;
};

const Ctx = createContext<Nav>(null as unknown as Nav);
export const useNav = () => useContext(Ctx);

export function ProveedorNav({ children }: { children: (actual: Pantalla) => ReactNode }) {
  const [pila, setPila] = useState<Pantalla[]>([{ n: "feed" }]);
  const [hoja, setHoja] = useState<ReactNode>(null);
  const [toast, setToast] = useState<string | null>(null);
  const t = useRef<number | undefined>(undefined);

  const cerrarHoja = useCallback(() => setHoja(null), []);
  const ir = useCallback((p: Pantalla) => { setHoja(null); setPila((s) => [...s, p]); }, []);
  const volver = useCallback(() => { setHoja(null); setPila((s) => (s.length > 1 ? s.slice(0, -1) : [{ n: "feed" }])); }, []);
  const reiniciar = useCallback((p: Pantalla) => { setHoja(null); setPila([p]); }, []);
  const aviso = useCallback((txt: string) => {
    setToast(txt);
    clearTimeout(t.current);
    t.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const actual = pila[pila.length - 1];
  useEffect(() => { document.getElementById("view")?.scrollTo(0, 0); }, [actual]);

  return (
    <Ctx.Provider value={{ actual, ir, volver, reiniciar, abrirHoja: setHoja, cerrarHoja, aviso }}>
      <main id="view" className="screen">{children(actual)}</main>
      {hoja && <div className="scrim" onClick={cerrarHoja} />}
      {hoja && (
        <div className="sheet" role="dialog">
          <div className="grab" />
          {hoja}
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </Ctx.Provider>
  );
}
