import { useEffect, useState } from "react";
import { collection, getDocs, limit, onSnapshot, orderBy, query, where, type Timestamp } from "firebase/firestore";
import { api } from "../api";
import { activarPush, estadoPush, type EstadoPush } from "../avisos";
import { TituloHoja } from "../componentes";
import { auth, db } from "../firebase";
import { Ic } from "../iconos";
import { useNav, type Pantalla } from "../nav";

type Aviso = { id: string; tipo: string; titulo: string; texto: string; url: string; leida: boolean; creadoEn?: Timestamp };

const ICONO: Record<string, string> = { nuevas: "photo", vidas: "heart", comentarios: "msg", ganancias: "coin" };

/** Lleva a la pantalla de un enlace de aviso: "/?u=usuario" o "/?ir=perfil|reels|feed". */
export async function destinoDe(url: string): Promise<Pantalla | null> {
  const p = new URL(url, location.origin).searchParams;
  const ir = p.get("ir");
  if (ir === "perfil") return { n: "perfil" };
  if (ir === "reels") return { n: "reels" };
  if (ir === "feed") return { n: "feed" };
  const u = p.get("u")?.trim().toLowerCase().replace(/^@/, "");
  if (!u) return null;
  const s = await getDocs(query(collection(db, "users"), where("username", "==", u), limit(1)));
  const d = s.docs[0];
  if (!d) return null;
  return d.id === auth.currentUser?.uid ? { n: "perfil" } : { n: "creador", id: d.id };
}

function hace(t?: Timestamp): string {
  if (!t) return "";
  const s = Math.max(0, (Date.now() - t.toMillis()) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return t.toDate().toLocaleDateString("es", { day: "numeric", month: "short" });
}

/** Últimos avisos del usuario, en vivo (null mientras cargan). */
function useAvisos(): Aviso[] | null {
  const [avisos, setAvisos] = useState<Aviso[] | null>(null);
  const uid = auth.currentUser?.uid;
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(query(collection(db, "private", uid, "notificaciones"), orderBy("creadoEn", "desc"), limit(40)),
      (s) => setAvisos(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Aviso)), () => setAvisos([]));
  }, [uid]);
  return avisos;
}

/** Campana con el número de avisos sin leer; abre la lista. */
export function Campana() {
  const { abrirHoja } = useNav();
  const avisos = useAvisos() ?? [];
  const sinLeer = avisos.filter((a) => !a.leida).length;
  return (
    <button className="iconbtn" style={{ position: "relative", width: 34, height: 34 }} aria-label={sinLeer ? `Notificaciones: ${sinLeer} sin leer` : "Notificaciones"}
      onClick={() => abrirHoja(<HojaNotificaciones />)}>
      <Ic n="bell" />
      {sinLeer > 0 && (
        <span style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: "var(--rojo)", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {sinLeer > 9 ? "9+" : sinLeer}
        </span>
      )}
    </button>
  );
}

/** Botón para activar los avisos push en este dispositivo (o su estado). */
export function ActivarAvisos({ compacto = false }: { compacto?: boolean }) {
  const { aviso } = useNav();
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { estadoPush().then(setEstado); }, []);
  if (estado === null || (estado === "activado" && compacto)) return null;
  const textos: Record<EstadoPush, string> = {
    "activado": "Recibes avisos en este dispositivo.",
    "pendiente": "Activa los avisos para saber cuándo vuelven tus vidas, hay fotos nuevas o te comentan.",
    "bloqueado": "Los avisos están bloqueados en este navegador. Actívalos en los ajustes del navegador para este sitio.",
    "no-soportado": "Este navegador no admite avisos. En iPhone, añade Blurry a la pantalla de inicio para recibirlos.",
  };
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", background: "var(--surface2)", borderRadius: 14, padding: 12, margin: "4px 0 12px" }}>
      <span style={{ fontSize: 20, color: estado === "activado" ? "var(--verde)" : "var(--naranja)" }}><Ic n="bell" /></span>
      <p style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>{textos[estado]}</p>
      {estado === "pendiente" && (
        <button className="chip on" disabled={ocupado} onClick={async () => {
          setOcupado(true);
          try {
            const e = await activarPush();
            setEstado(e);
            if (e === "activado") aviso("Avisos activados");
          } catch {
            aviso("No se pudieron activar los avisos");
          } finally {
            setOcupado(false);
          }
        }}>{ocupado ? "…" : "Activar"}</button>
      )}
    </div>
  );
}

function HojaNotificaciones() {
  const { ir, cerrarHoja } = useNav();
  const avisos = useAvisos();
  // Al verlos, se marcan como leídos (el punto rosa se mantiene mientras la hoja sigue abierta).
  const [vistos] = useState(() => new Set<string>());
  useEffect(() => {
    if (avisos?.some((a) => !a.leida && !vistos.has(a.id))) {
      avisos.forEach((a) => vistos.add(a.id));
      api.marcarLeidas({}).catch(() => {});
    }
  }, [avisos, vistos]);
  return (
    <>
      <TituloHoja>Notificaciones</TituloHoja>
      <ActivarAvisos compacto />
      {avisos === null ? <p className="sub">Cargando…</p> : !avisos.length ? (
        <p className="sub" style={{ textAlign: "center", padding: "24px 0" }}>Aún no tienes avisos.</p>
      ) : avisos.map((a) => (
        <button key={a.id} className="lrow" style={{ width: "100%", textAlign: "left", alignItems: "flex-start", opacity: a.leida ? 0.75 : 1 }}
          onClick={async () => { cerrarHoja(); const d = await destinoDe(a.url).catch(() => null); if (d) ir(d); }}>
          <span style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flex: "none", color: a.tipo === "vidas" ? "var(--rojo)" : a.tipo === "ganancias" ? "var(--oro)" : "var(--fg)" }}>
            <Ic n={ICONO[a.tipo] ?? "bell"} lleno={a.tipo === "vidas"} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: a.leida ? 600 : 800 }}>{a.titulo}</p>
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, overflowWrap: "anywhere" }}>{a.texto}</p>
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{hace(a.creadoEn)}</p>
          </div>
          {!a.leida && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--rosa)", marginTop: 6, flex: "none" }} />}
        </button>
      ))}
    </>
  );
}
