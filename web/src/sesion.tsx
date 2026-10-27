import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { diaDe } from "./util";

export type Perfil = {
  username: string;
  avatarUrl: string | null;
  intereses: string[];
  seguidores: number;
  siguiendo: number;
  totalMeGusta: number;
  totalDesbloqueos: number;
  porcentajeMeGusta: number | null;
  numPublicaciones: number;
  esVip: boolean;
  identidadVerificada: boolean;
};

export type Privado = {
  nombreReal: string;
  fechaNacimiento: string;
  correo: string | null;
  monedas: number;
  vidas: number;
  vidasVuelvenEn: Timestamp | null;
  vidasDia: string | null;
  gananciasDisponibles: number;
  gananciasEnEspera: number;
  ajustes: Record<string, boolean>;
};

type Sesion = {
  cargando: boolean;
  usuario: User | null;
  perfil: Perfil | null;
  privado: Privado | null;
};

const Ctx = createContext<Sesion>({ cargando: true, usuario: null, perfil: null, privado: null });

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [listoAuth, setListoAuth] = useState(false);
  const [perfil, setPerfil] = useState<Perfil | null | undefined>(undefined);
  const [privado, setPrivado] = useState<Privado | null | undefined>(undefined);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUsuario(u); setListoAuth(true); }), []);

  useEffect(() => {
    if (!usuario) { setPerfil(null); setPrivado(null); return; }
    setPerfil(undefined);
    setPrivado(undefined);
    const a = onSnapshot(doc(db, "users", usuario.uid), (s) => setPerfil(s.exists() ? (s.data() as Perfil) : null), () => setPerfil(null));
    const b = onSnapshot(doc(db, "private", usuario.uid), (s) => setPrivado(s.exists() ? (s.data() as Privado) : null), () => setPrivado(null));
    return () => { a(); b(); };
  }, [usuario]);

  const cargando = !listoAuth || (usuario !== null && (perfil === undefined || privado === undefined));
  return <Ctx.Provider value={{ cargando, usuario, perfil: perfil ?? null, privado: privado ?? null }}>{children}</Ctx.Provider>;
}

export const useSesion = () => useContext(Ctx);

/** Vidas que el jugador tiene ahora (las recupera igual que el servidor). */
export function vidasAhora(p: Privado | null, ahora = Date.now()): number {
  if (!p) return 3;
  if (p.vidas <= 0) return !p.vidasVuelvenEn || p.vidasVuelvenEn.toMillis() <= ahora ? 3 : 0;
  if (p.vidas < 3 && p.vidasDia !== diaDe(new Date(ahora))) return 3;
  return p.vidas;
}
