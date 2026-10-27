import { useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, orderBy, query, updateDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { api, errorDe } from "../api";
import { Avatar, Cargando, Corazones, ImagenStorage, TituloHoja } from "../componentes";
import { auth, db, storage } from "../firebase";
import { Ic } from "../iconos";
import { useNav } from "../nav";
import { useSesion } from "../sesion";
import { dinero, nf, reducirImagen } from "../util";

type MiPost = {
  id: string; tipo: "foto" | "video"; precio: number; estado: string; oculta: boolean; rutaOriginal: string | null;
  rutaBorrosa: string | null; meGusta: number; intentos: number; fallos: number; desbloqueos: number; monedasGastadas?: number; motivoRechazo?: string;
};

const ESTADO: Record<string, string> = { subiendo: "Subiendo", revision: "En revisión", rechazada: "Rechazada" };
let pestanaGuardada: "pub" | "col" | "seg" = "pub";

export function Perfil() {
  const { perfil, privado } = useSesion();
  const { ir, abrirHoja } = useNav();
  const [pestana, setPestana] = useState(pestanaGuardada);
  const uid = auth.currentUser!.uid;
  useEffect(() => { pestanaGuardada = pestana; }, [pestana]);
  if (!perfil || !privado) return <Cargando />;

  const pct = perfil.porcentajeMeGusta;
  return (
    <>
      <div className="top">
        <button className="iconbtn" onClick={() => ir({ n: "feed" })} aria-label="Volver"><Ic n="back" /></button>
        <h1>@{perfil.username}</h1>
        <button className="iconbtn" onClick={() => ir({ n: "ajustes" })} aria-label="Ajustes"><Ic n="gear" /></button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 6 }}>
        <button onClick={() => abrirHoja(<EditarPerfil />)} style={{ position: "relative", padding: 3, borderRadius: "50%", background: "var(--grad)" }} aria-label="Cambiar foto de perfil">
          <Avatar url={perfil.avatarUrl} tam={88} borde="3px solid var(--bg)" />
          <span style={{ position: "absolute", right: 0, bottom: 2, width: 28, height: 28, borderRadius: "50%", background: "var(--fg)", color: "var(--bg)", border: "3px solid var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}><Ic n="camera" /></span>
        </button>
        <Corazones />
        <button className="chip" onClick={() => abrirHoja(<EditarPerfil />)}><Ic n="pencil" /> Editar perfil</button>
      </div>
      <div style={{ display: "flex", marginTop: 16 }}>
        <div className="stat"><b>{nf(perfil.numPublicaciones)}</b><span>Publicaciones</span></div>
        <div className="stat"><b>{nf(perfil.seguidores)}</b><span>Seguidores</span></div>
        <div className="stat"><b>{pct === null ? "Nuevo" : `${pct}%`}</b><span>Me gusta</span></div>
      </div>
      <div className="wallet" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}><small>MONEDAS</small><div className="num"><span style={{ color: "var(--oro)" }}><Ic n="coin" /></span>{nf(privado.monedas)}</div>
            {(privado.monedasRegalo ?? 0) > 0 && <p style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{nf(privado.monedasRegalo ?? 0)} de regalo</p>}</div>
          <div style={{ flex: 1 }}><small>GANANCIAS</small><div className="num" style={{ color: "#6FD6AE" }}>{dinero(privado.gananciasDisponibles)}</div>
            {privado.gananciasEnEspera > 0 && <p style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>+{dinero(privado.gananciasEnEspera)} en espera</p>}</div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button className="wbtn" onClick={() => ir({ n: "tienda" })} style={{ background: "rgba(255,255,255,.13)", color: "#fff" }}><Ic n="plus" />Comprar</button>
          <button className="wbtn" onClick={() => ir({ n: "retiro" })} style={{ background: "#fff", color: "#2A2126" }}><Ic n="up" />Retirar</button>
        </div>
      </div>
      <div className="seg" style={{ margin: "18px 0 10px" }} role="tablist">
        {([["pub", "Publicaciones"], ["col", "Colección"], ["seg", "Seguidos"]] as const).map(([k, t]) => (
          <button key={k} className={pestana === k ? "on" : ""} role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}>{t}</button>
        ))}
      </div>
      {pestana === "pub" && <MisPublicaciones uid={uid} />}
      {pestana === "col" && <Coleccion uid={uid} />}
      {pestana === "seg" && <Seguidos uid={uid} />}
      <button className="fab" onClick={() => ir({ n: "crear" })} aria-label="Añadir publicación"><Ic n="plus" /></button>
    </>
  );
}

function MisPublicaciones({ uid }: { uid: string }) {
  const { abrirHoja } = useNav();
  const [posts, setPosts] = useState<MiPost[] | null>(null);
  useEffect(() => {
    getDocs(query(collection(db, "posts"), where("creadorId", "==", uid), orderBy("creadoEn", "desc"))).then((s) =>
      setPosts(s.docs.map((d) => ({ id: d.id, ...d.data() }) as MiPost)),
    );
  }, [uid]);
  if (!posts) return <Cargando />;
  if (!posts.length) return <p className="sub" style={{ textAlign: "center", padding: "40px 0" }}>Aún no publicas nada. Toca + para subir tu primera foto.</p>;
  return (
    <div className="grid3" style={{ marginInline: 0 }}>
      {posts.map((p) => (
        <button key={p.id} className="cell" aria-label="Publicación" onClick={() => abrirHoja(<DetallePost post={p} />)}>
          {p.rutaOriginal && p.estado !== "subiendo" ? <ImagenStorage ruta={p.tipo === "video" ? p.rutaBorrosa : p.rutaOriginal} /> : <div style={{ width: "100%", height: "100%", background: "var(--surface2)" }} />}
          {p.tipo === "video" && <span className="c" style={{ top: 6, right: 6 }}><Ic n="play" lleno /></span>}
          {(p.estado !== "aprobada" || p.oculta) && <span className="c" style={{ top: 6, left: 6, background: "rgba(0,0,0,.55)", padding: "2px 6px", borderRadius: 6 }}>{p.oculta ? "Oculta" : ESTADO[p.estado]}</span>}
          <span className="c" style={{ left: 6, bottom: 6 }}><Ic n="coin" />{p.precio}</span>
          <span className="c" style={{ right: 6, bottom: 6 }}><Ic n="heart" lleno />{p.meGusta}</span>
        </button>
      ))}
    </div>
  );
}

function DetallePost({ post }: { post: MiPost }) {
  const [pregunta, setPregunta] = useState<{ texto: string; respuesta: string; falsas: string[] } | null | false>(null);
  useEffect(() => { api.miPregunta({ postId: post.id }).then(setPregunta, () => setPregunta(false)); }, [post.id]);
  const aciertan = post.intentos ? Math.round(((post.intentos - post.fallos) / post.intentos) * 100) : 0;
  const ganado = (post.monedasGastadas ?? 0) * 5;
  return (
    <>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
        <div style={{ width: 64, height: 84, borderRadius: 10, overflow: "hidden", flex: "none" }}>
          {post.rutaOriginal && post.estado !== "subiendo" ? <ImagenStorage ruta={post.tipo === "video" ? post.rutaBorrosa : post.rutaOriginal} /> : null}
        </div>
        <div>
          <p style={{ fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 17 }}>{post.tipo === "video" ? "Video" : "Foto"}</p>
          <p className="sub" style={{ marginTop: 2 }}>{post.precio} monedas · {post.meGusta} me gusta{post.estado !== "aprobada" ? ` · ${ESTADO[post.estado]}` : ""}{post.oculta ? " · Oculta por reportes" : ""}</p>
          {post.estado === "rechazada" && post.motivoRechazo && <p style={{ fontSize: 12, color: "var(--rojo)", marginTop: 2 }}>Motivo: {post.motivoRechazo}</p>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 }}>
        <div style={{ background: "var(--surface2)", borderRadius: 12, padding: 12 }}><p className="lbl" style={{ margin: 0 }}>Aciertan</p><p style={{ fontFamily: "var(--f-display)", fontSize: 22, fontWeight: 700, marginTop: 4 }}>{post.intentos ? `${aciertan}%` : "—"}</p></div>
        <div style={{ background: "var(--surface2)", borderRadius: 12, padding: 12 }}><p className="lbl" style={{ margin: 0 }}>Ganado</p><p style={{ fontFamily: "var(--f-display)", fontSize: 22, fontWeight: 700, marginTop: 4, color: "var(--verde)" }}>{dinero(ganado)}</p></div>
      </div>
      <p className="lbl">Tu pregunta</p>
      {pregunta === null ? <p className="sub">Cargando…</p> : pregunta ? (
        <div style={{ padding: "4px 0" }}>
          <p style={{ fontSize: 15, fontWeight: 600 }}>{pregunta.texto}</p>
          <p style={{ fontSize: 13, color: "var(--verde)", marginTop: 6 }}><Ic n="check" /> {pregunta.respuesta}</p>
          {pregunta.falsas.map((f) => <p key={f} style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}><Ic n="x" /> {f}</p>)}
        </div>
      ) : <p className="sub">No se pudo cargar.</p>}
    </>
  );
}

function Coleccion({ uid }: { uid: string }) {
  const { ir } = useNav();
  const [items, setItems] = useState<{ postId: string; creadorId: string; ruta: string | null; usuario: string }[] | null>(null);
  useEffect(() => {
    (async () => {
      const s = await getDocs(query(collection(db, "users", uid, "desbloqueos"), orderBy("creadoEn", "desc")));
      const nombres = new Map<string, string>();
      const lista = await Promise.all(s.docs.map(async (d) => {
        const creadorId = d.get("creadorId") as string;
        if (!nombres.has(creadorId)) nombres.set(creadorId, (await getDoc(doc(db, "users", creadorId))).get("username") ?? "");
        const p = await getDoc(doc(db, "posts", d.id)).catch(() => null);
        return { postId: d.id, creadorId, ruta: p?.exists() ? (p.get("tipo") === "video" ? p.get("rutaBorrosa") : p.get("rutaOriginal")) : null, usuario: nombres.get(creadorId)! };
      }));
      setItems(lista.filter((x) => x.ruta));
    })();
  }, [uid]);
  if (!items) return <Cargando />;
  if (!items.length) return <p className="sub" style={{ textAlign: "center", padding: "40px 0" }}>Aún no desbloqueas fotos.</p>;
  return (
    <>
      <p className="sub" style={{ margin: "0 2px 10px" }}>Fotos que desbloqueaste, jugando o pagando.</p>
      <div className="grid3">
        {items.map((x) => (
          <button key={x.postId} className="cell" aria-label={`Foto de @${x.usuario}`} onClick={() => ir({ n: "creador", id: x.creadorId, postId: x.postId })}>
            <ImagenStorage ruta={x.ruta} />
            <span className="c" style={{ left: 6, bottom: 6 }}>@{x.usuario}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function Seguidos({ uid }: { uid: string }) {
  const { ir } = useNav();
  const [lista, setLista] = useState<{ id: string; username: string; avatarUrl: string | null; tot: number; hechas: number }[] | null>(null);
  useEffect(() => {
    (async () => {
      const [s, p] = await Promise.all([getDocs(collection(db, "users", uid, "siguiendo")), getDocs(collection(db, "users", uid, "progreso"))]);
      const prog = Object.fromEntries(p.docs.map((d) => [d.id, d.get("siguienteOrden") ?? 0]));
      const us = await Promise.all(s.docs.map((d) => getDoc(doc(db, "users", d.id))));
      setLista(us.filter((u) => u.exists()).map((u) => ({
        id: u.id, username: u.get("username"), avatarUrl: u.get("avatarUrl"), tot: u.get("numPublicaciones") ?? 0, hechas: Math.min(prog[u.id] ?? 0, u.get("numPublicaciones") ?? 0),
      })));
    })();
  }, [uid]);
  if (!lista) return <Cargando />;
  if (!lista.length) return <p className="sub" style={{ textAlign: "center", padding: "40px 0" }}>Aún no sigues a nadie.</p>;
  return (
    <>
      {lista.map((c) => (
        <div className="lrow" key={c.id}>
          <Avatar url={c.avatarUrl} tam={46} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: 14 }}>@{c.username}</p>
            <div className="bar" style={{ margin: "6px 0 3px" }}><i style={{ width: `${c.tot ? Math.round((c.hechas / c.tot) * 100) : 0}%` }} /></div>
            <p style={{ fontSize: 11, color: "var(--muted)" }}>{c.hechas} de {c.tot} desbloqueadas</p>
          </div>
          <button className="follow" onClick={() => ir({ n: "creador", id: c.id })}>Jugar</button>
        </div>
      ))}
    </>
  );
}

function EditarPerfil() {
  const { perfil } = useSesion();
  const { cerrarHoja, aviso } = useNav();
  const [nombre, setNombre] = useState(perfil?.username ?? "");
  const [foto, setFoto] = useState<Blob | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string }>({ ok: true, t: "Tu nombre real nunca se muestra." });
  const [guardando, setGuardando] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const v = nombre.trim().toLowerCase();
    if (v.length < 3) return setMsg({ ok: false, t: "Mínimo 3 caracteres" });
    if (!/^[a-z0-9_]+$/.test(v)) return setMsg({ ok: false, t: "Solo letras, números y guion bajo" });
    if (v === perfil?.username) return setMsg({ ok: true, t: "Tu nombre real nunca se muestra." });
    setMsg({ ok: false, t: "Comprobando…" });
    const t = setTimeout(() => api.nombreDisponible({ username: v }).then((r) => setMsg({ ok: r.disponible, t: r.mensaje }), (e) => setMsg({ ok: false, t: errorDe(e).mensaje })), 400);
    return () => clearTimeout(t);
  }, [nombre, perfil?.username]);

  async function guardar() {
    if (!msg.ok || guardando) return;
    setGuardando(true);
    try {
      const uid = auth.currentUser!.uid;
      const v = nombre.trim().toLowerCase();
      if (v !== perfil?.username) await api.cambiarUsername({ username: v });
      if (foto) {
        const r = ref(storage, `avatares/${uid}.jpg`);
        await uploadBytes(r, foto, { contentType: "image/jpeg" });
        await updateDoc(doc(db, "users", uid), { avatarUrl: await getDownloadURL(r) });
      }
      cerrarHoja();
      aviso("Perfil actualizado");
    } catch (e) {
      setMsg({ ok: false, t: errorDe(e).mensaje });
      setGuardando(false);
    }
  }

  return (
    <>
      <p style={{ fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 18, textAlign: "center", marginBottom: 14 }}>Editar perfil</p>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <Avatar url={vista ?? perfil?.avatarUrl} tam={88} />
        <button style={{ fontWeight: 700, fontSize: 14, color: "var(--rosa)" }} onClick={() => archivo.current?.click()}>Cambiar foto</button>
        <input ref={archivo} type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const b = await reducirImagen(f, 400, 0.85);
          setFoto(b);
          setVista(URL.createObjectURL(b));
        }} />
      </div>
      <TituloHoja><span className="lbl" style={{ display: "block" }}>Nombre de usuario</span></TituloHoja>
      <div className="field">
        <span style={{ color: "var(--muted)" }}>@</span>
        <input maxLength={20} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" aria-label="Nombre de usuario" />
        <span style={{ color: msg.ok ? "var(--verde)" : "var(--rojo)" }}><Ic n={msg.ok ? "check" : "x"} /></span>
      </div>
      <p style={{ fontSize: 12, color: msg.ok ? "var(--muted)" : "var(--rojo)", margin: "6px 2px 0" }}>{msg.t}</p>
      <button className={`btn ${msg.ok && !guardando ? "grad" : "off"}`} style={{ marginTop: 18 }} onClick={guardar}>{guardando ? "Guardando…" : "Guardar"}</button>
    </>
  );
}
