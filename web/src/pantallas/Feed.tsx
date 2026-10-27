import { useEffect, useRef, useState } from "react";
import { collection, doc, endAt, getDoc, getDocs, limit, orderBy, query, startAt, where, type QueryConstraint } from "firebase/firestore";
import { api, errorDe } from "../api";
import { Arte, Avatar, BotonesFlotantes, Cargando, claseEntrada, Corazones, PildoraMonedas } from "../componentes";
import { auth, db } from "../firebase";
import { Ic } from "../iconos";
import { useNav } from "../nav";
import { useSesion } from "../sesion";
import { Campana } from "./Notificaciones";
import { dificultad, nf } from "../util";

export type Creador = {
  id: string;
  username: string;
  avatarUrl: string | null;
  intereses: string[];
  seguidores: number;
  totalMeGusta: number;
  totalDesbloqueos: number;
  porcentajeMeGusta: number | null;
  porcentajeFallos: number;
  numPublicaciones: number;
  precioPromedio?: number | null;
  creadoEn?: { toMillis(): number };
};

const FILTROS = ["Nuevos", "Siguiendo", "Populares", "Para ti"] as const;
type Filtro = (typeof FILTROS)[number];
let filtroGuardado: Filtro = "Nuevos";
export const elegirFiltroInicial = (f: Filtro) => { filtroGuardado = f; };

async function cargar(filtro: Filtro, intereses: string[], siguiendo: Set<string>): Promise<Creador[]> {
  const base = collection(db, "users");
  const lista = (cs: QueryConstraint[]) => getDocs(query(base, where("esCreador", "==", true), ...cs, limit(40))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }) as Creador));

  if (filtro === "Siguiendo") {
    const docs = await Promise.all([...siguiendo].map((id) => getDoc(doc(db, "users", id))));
    return docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() }) as Creador);
  }
  if (filtro === "Populares") return lista([orderBy("totalMeGusta", "desc")]);
  if (filtro === "Nuevos") return lista([orderBy("creadoEn", "desc")]);
  // Para ti: creadores con intereses en común, primero los que más comparten.
  if (!intereses.length) return [];
  const r = await lista([where("intereses", "array-contains-any", intereses.slice(0, 10))]);
  const comunes = (c: Creador) => c.intereses.filter((i) => intereses.includes(i)).length;
  return r.sort((a, b) => comunes(b) - comunes(a));
}

/** Barra horizontal que también se desplaza con la rueda del ratón y arrastrando. */
function useBarraDesplazable() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rueda = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    let inicio: { x: number; scroll: number } | null = null;
    let movido = false;
    const bajar = (e: PointerEvent) => { if (e.pointerType === "mouse") { inicio = { x: e.clientX, scroll: el.scrollLeft }; movido = false; } };
    const mover = (e: PointerEvent) => {
      if (!inicio) return;
      const dx = e.clientX - inicio.x;
      if (Math.abs(dx) > 4) movido = true;
      el.scrollLeft = inicio.scroll - dx;
    };
    const soltar = () => { inicio = null; };
    // Si arrastró, el clic que viene después no cambia de filtro.
    const clic = (e: MouseEvent) => { if (movido) { e.stopPropagation(); e.preventDefault(); movido = false; } };
    el.addEventListener("wheel", rueda, { passive: false });
    el.addEventListener("pointerdown", bajar);
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    el.addEventListener("click", clic, true);
    return () => {
      el.removeEventListener("wheel", rueda);
      el.removeEventListener("pointerdown", bajar);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      el.removeEventListener("click", clic, true);
    };
  }, []);
  return ref;
}

export function Feed() {
  const { perfil, bloqueados } = useSesion();
  const { ir, aviso, abrirHoja } = useNav();
  const [filtro, setFiltro] = useState<Filtro>(filtroGuardado);
  const [creadores, setCreadores] = useState<Creador[] | null>(null);
  const [progreso, setProgreso] = useState<Record<string, number>>({});
  const [siguiendo, setSiguiendo] = useState<Set<string> | null>(null);
  const uid = auth.currentUser!.uid;
  const barra = useBarraDesplazable();
  const [entrada] = useState(claseEntrada);

  useEffect(() => {
    Promise.all([getDocs(collection(db, "users", uid, "siguiendo")), getDocs(collection(db, "users", uid, "progreso"))]).then(([s, p]) => {
      setSiguiendo(new Set(s.docs.map((d) => d.id)));
      setProgreso(Object.fromEntries(p.docs.map((d) => [d.id, d.get("siguienteOrden") ?? 0])));
    });
  }, [uid]);

  useEffect(() => {
    if (!siguiendo || !perfil) return;
    filtroGuardado = filtro;
    let vivo = true;
    setCreadores(null);
    cargar(filtro, perfil.intereses ?? [], siguiendo).then(
      (r) => {
        if (!vivo) return;
        let l = r.filter((c) => c.id !== uid && c.numPublicaciones > 0 && !bloqueados.has(c.id));
        // "Siguiendo" solo muestra a quien tiene fotos nuevas por jugar.
        if (filtro === "Siguiendo") l = l.filter((c) => c.numPublicaciones > (progreso[c.id] ?? 0));
        setCreadores(l);
      },
      (e) => { if (vivo) { setCreadores([]); aviso(errorDe(e).mensaje); } },
    );
    return () => { vivo = false; };
    // siguiendo cambia al seguir/dejar de seguir; no recargamos la lista por eso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, siguiendo === null, perfil?.intereses?.join()]);

  async function alternarSeguir(id: string) {
    if (!siguiendo) return;
    const sigue = siguiendo.has(id);
    const n = new Set(siguiendo);
    if (sigue) n.delete(id); else n.add(id);
    setSiguiendo(n);
    try {
      await (sigue ? api.dejarDeSeguir({ creadorId: id }) : api.seguir({ creadorId: id }));
    } catch (e) {
      setSiguiendo(siguiendo);
      aviso(errorDe(e).mensaje);
    }
  }

  return (
    <>
      <div className={entrada}>
      <div className="top">
        <p style={{ fontFamily: "var(--f-display)", fontWeight: 800, fontSize: 30, letterSpacing: "-.01em", flex: 1 }}>Blurry</p>
        <Campana /> <Corazones /> <PildoraMonedas />
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <button onClick={() => ir({ n: "perfil" })} aria-label="Mi perfil" style={{ borderRadius: "50%", flex: "none", marginTop: 1 }}>
          <Avatar url={perfil?.avatarUrl} tam={36} />
        </button>
        <div className="filters" role="tablist" ref={barra} style={{ flex: 1, minWidth: 0 }}>
          {FILTROS.map((f) => (
            <button key={f} className={`chip ${f === filtro ? "on" : ""}`} role="tab" aria-selected={f === filtro} onClick={() => setFiltro(f)}>{f}</button>
          ))}
          <button className="chip" aria-label="Buscar usuarios" onClick={() => abrirHoja(<BuscarUsuarios />)}><Ic n="search" /></button>
        </div>
      </div>
      <div id="cards">
        {creadores === null ? <Cargando /> : creadores.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <span style={{ display: "inline-flex", width: 64, height: 64, borderRadius: "50%", background: "var(--surface2)", alignItems: "center", justifyContent: "center", fontSize: 30, color: "var(--verde)" }}><Ic n="check" /></span>
            <p className="h2" style={{ fontSize: 20, marginTop: 14 }}>{filtro === "Siguiendo" ? "Estás al día" : "No hay creadores aquí todavía"}</p>
            <p className="sub">{filtro === "Siguiendo" ? "Tus seguidos no tienen fotos nuevas. Mira otros creadores." : "Prueba con otro filtro."}</p>
            {filtro === "Siguiendo" && <button className="btn soft" style={{ marginTop: 16 }} onClick={() => setFiltro("Para ti")}>Ver “Para ti”</button>}
          </div>
        ) : creadores.map((c) => {
          const [dl, dbg, dfg] = dificultad(c);
          const hechas = Math.min(progreso[c.id] ?? 0, c.numPublicaciones);
          const tot = c.numPublicaciones;
          const nuevas = siguiendo?.has(c.id) ? tot - hechas : 0;
          const fin = hechas >= tot;
          const abrir = () => ir({ n: "creador", id: c.id });
          return (
            <div key={c.id} className="card" role="button" tabIndex={0} onClick={abrir} onKeyDown={(e) => e.key === "Enter" && abrir()}>
              <div className="img">
                {c.avatarUrl ? <img src={c.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <Arte fondo="#F4C0D1" />}
                {nuevas > 0 && <span className="tag" style={{ left: 10, background: "var(--grad)", color: "#fff" }}>+{nuevas} nuevas</span>}
                {c.precioPromedio != null && <span className="tag" style={{ right: 10, background: "rgba(20,14,18,.62)", color: "#fff" }}>≈ {c.precioPromedio} <span style={{ color: "var(--oro)" }}><Ic n="coin" /></span></span>}
              </div>
              <div className="body">
                <div className="row">
                  <span className="name">@{c.username}</span>
                  <button className={`follow ${siguiendo?.has(c.id) ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); alternarSeguir(c.id); }}>
                    {siguiendo?.has(c.id) ? "Siguiendo" : "Seguir"}
                  </button>
                </div>
                <div className="meta">
                  <span className="diff" style={{ background: dbg, color: dfg }}>{dl}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ color: "var(--rosa)" }}><Ic n="heart" lleno /></span>{c.porcentajeMeGusta === null ? "Nuevo" : `${c.porcentajeMeGusta}%`} · {nf(c.totalMeGusta)}</span>
                  <span>{tot} {tot === 1 ? "foto" : "fotos"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                  <div className={`bar ${fin ? "done" : ""}`} style={{ flex: 1 }}><i style={{ width: `${Math.round((hechas / tot) * 100)}%` }} /></div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: fin ? "var(--verde)" : "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{fin ? "Completado" : hechas ? `${hechas} de ${tot}` : "Sin empezar"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </div>
      <BotonesFlotantes seccion="juego" />
    </>
  );
}

/** Busca usuarios por el principio de su nombre de usuario (se guardan en minúsculas). */
function BuscarUsuarios() {
  const { ir, cerrarHoja } = useNav();
  const { bloqueados } = useSesion();
  const [texto, setTexto] = useState("");
  const [lista, setLista] = useState<{ id: string; username: string; avatarUrl: string | null; numPublicaciones: number }[] | null>(null);
  useEffect(() => {
    const q = texto.trim().toLowerCase().replace(/^@/, "");
    if (!q) return setLista(null);
    const t = setTimeout(() => {
      getDocs(query(collection(db, "users"), orderBy("username"), startAt(q), endAt(q + "\uf8ff"), limit(20))).then(
        (s) => setLista(s.docs.map((d) => ({ id: d.id, username: d.get("username"), avatarUrl: d.get("avatarUrl") ?? null, numPublicaciones: d.get("numPublicaciones") ?? 0 }))),
        () => setLista([]),
      );
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);
  return (
    <>
      <div className="field">
        <span style={{ color: "var(--muted)" }}><Ic n="search" /></span>
        <input autoFocus placeholder="Buscar por nombre de usuario" aria-label="Buscar por nombre de usuario" autoComplete="off" value={texto} onChange={(e) => setTexto(e.target.value)} />
      </div>
      <div style={{ minHeight: 200, marginTop: 8 }}>
        {lista === null ? null : lista.length === 0 ? <p className="sub" style={{ textAlign: "center", padding: "24px 0" }}>No hay nadie con ese nombre.</p> : lista.filter((u) => !bloqueados.has(u.id)).map((u) => (
          <button key={u.id} className="lrow" style={{ width: "100%", textAlign: "left" }} onClick={() => { cerrarHoja(); ir(u.id === auth.currentUser?.uid ? { n: "perfil" } : { n: "creador", id: u.id }); }}>
            <Avatar url={u.avatarUrl} tam={42} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: 14 }}>@{u.username}</p>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>{u.numPublicaciones} {u.numPublicaciones === 1 ? "foto" : "fotos"}</p>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
