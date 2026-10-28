import { useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { api, errorDe, type PreguntaNueva } from "../api";
import { AvisoFasePrueba, Avatar, Cargando, Corazones, HiloComentarios, HojaCompartir, ImagenStorage, PantallaCompleta, TituloHoja } from "../componentes";
import { auth, db, storage } from "../firebase";
import { Ic } from "../iconos";
import { useNav } from "../nav";
import { useSesion } from "../sesion";
import { dinero, FASE_PRUEBA, nf, reducirImagen } from "../util";
import { HojaEditarReel, type Reel } from "./Reels";

type MiPost = {
  id: string; tipo: "foto" | "video"; precio: number; estado: string; oculta: boolean; rutaOriginal: string | null;
  rutaBorrosa: string | null; meGusta: number; comentarios?: number; intentos: number; fallos: number; desbloqueos: number; monedasGastadas?: number; monedasRecibidas?: number; motivoRechazo?: string;
};

const ESTADO: Record<string, string> = { subiendo: "Subiendo", revision: "En revisión", rechazada: "Rechazada" };
let pestanaGuardada: "pub" | "reels" | "col" | "seg" = "pub";

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
        <h1>Perfil</h1>
        <div style={{ display: "flex" }}>
          <button className="iconbtn" onClick={() => abrirHoja(<HojaCompartir username={perfil.username} propio />)} aria-label="Compartir"><Ic n="share" /></button>
          <button className="iconbtn" onClick={() => ir({ n: "ajustes" })} aria-label="Ajustes"><Ic n="gear" /></button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 6 }}>
        <Avatar url={perfil.avatarUrl} tam={88} ampliable />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 18 }}>@{perfil.username}</span>
          <button className="iconbtn" style={{ width: 30, height: 30, color: "var(--muted)" }} onClick={() => abrirHoja(<EditarPerfil />)} aria-label="Editar nombre de usuario y foto"><Ic n="pencil" /></button>
        </div>
        <Corazones />
      </div>
      <div style={{ display: "flex", marginTop: 16 }}>
        <div className="stat"><b>{nf(perfil.numPublicaciones)}</b><span>Publicaciones</span></div>
        <div className="stat"><b>{nf(perfil.seguidores)}</b><span>Seguidores</span></div>
        <div className="stat"><b>{pct === null ? "Nuevo" : `${pct}%`}</b><span>Me gusta</span></div>
      </div>
      <div className="wallet" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}><small>MONEDAS</small><div className="num"><span style={{ color: "var(--oro)" }}><Ic n="coin" /></span>{nf(privado.monedas)}</div></div>
          {FASE_PRUEBA ? (
            <div style={{ flex: 1 }}><small>GANADAS CON TUS FOTOS</small><div className="num" style={{ color: "#6FD6AE" }}><span style={{ color: "var(--oro)" }}><Ic n="coin" /></span>{nf(privado.monedasGanadas ?? 0)}</div></div>
          ) : (
            <div style={{ flex: 1 }}><small>GANANCIAS</small><div className="num" style={{ color: "#6FD6AE" }}>{dinero(privado.gananciasDisponibles)}</div>
              {privado.gananciasEnEspera > 0 && <p style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>+{dinero(privado.gananciasEnEspera)} en espera</p>}</div>
          )}
        </div>
        {FASE_PRUEBA ? <AvisoFasePrueba oscuro /> : (
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="wbtn" onClick={() => ir({ n: "tienda" })} style={{ background: "rgba(255,255,255,.13)", color: "#fff" }}><Ic n="plus" />Comprar</button>
            <button className="wbtn" onClick={() => ir({ n: "retiro" })} style={{ background: "#fff", color: "#2A2126" }}><Ic n="up" />Retirar</button>
          </div>
        )}
      </div>
      <div className="seg" style={{ margin: "18px 0 10px" }} role="tablist">
        {([["pub", "Publicaciones"], ["reels", "Reels"], ["col", "Colección"], ["seg", "Seguidos"]] as const).map(([k, t]) => (
          <button key={k} className={pestana === k ? "on" : ""} role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}>{t}</button>
        ))}
      </div>
      {pestana === "pub" && <MisPublicaciones uid={uid} />}
      {pestana === "reels" && <MisReels uid={uid} />}
      {pestana === "col" && <Coleccion uid={uid} />}
      {pestana === "seg" && <Seguidos uid={uid} />}
      <button className="fab" onClick={() => ir({ n: "crear" })} aria-label="Añadir publicación"><Ic n="plus" /></button>
    </>
  );
}

function MisPublicaciones({ uid }: { uid: string }) {
  const { abrirHoja } = useNav();
  const [posts, setPosts] = useState<MiPost[] | null>(null);
  // En vivo: una publicación recién subida pasa de "Subiendo" a publicada sola.
  useEffect(() => onSnapshot(query(collection(db, "posts"), where("creadorId", "==", uid), orderBy("creadoEn", "desc")), (s) =>
    setPosts(s.docs.map((d) => ({ id: d.id, ...d.data() }) as MiPost).filter((p) => p.estado !== "eliminada")),
  ), [uid]);
  const quitar = (id: string) => setPosts((l) => l && l.filter((p) => p.id !== id));
  if (!posts) return <Cargando />;
  if (!posts.length) return <p className="sub" style={{ textAlign: "center", padding: "40px 0" }}>Aún no publicas nada. Toca + para subir tu primera foto.</p>;
  return (
    <div className="grid3">
      {posts.map((p) => (
        <button key={p.id} className="cell" aria-label="Publicación" onClick={() => abrirHoja(<DetallePost post={p} alEliminar={() => quitar(p.id)} />)}>
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

function DetallePost({ post, alEliminar }: { post: MiPost; alEliminar: () => void }) {
  const { cerrarHoja, aviso } = useNav();
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [preguntas, setPreguntas] = useState<{ texto: string; respuesta: string; falsas: string[]; autor: string }[] | null>(null);
  const [editando, setEditando] = useState(false);
  const [ampliada, setAmpliada] = useState(false);
  useEffect(() => { api.misPreguntas({ postId: post.id }).then((r) => setPreguntas(r.preguntas), () => setPreguntas([])); }, [post.id]);
  const aciertan = post.intentos ? Math.round(((post.intentos - post.fallos) / post.intentos) * 100) : 0;
  const ganado = (post.monedasGastadas ?? 0) * 5;
  return (
    <>
      {/* La foto (o el video) a tamaño real, entera; la información va debajo. */}
      {/* Tocar la foto la abre a pantalla completa (el video ya tiene su botón de pantalla completa). */}
      <div style={{ width: "100%", height: "min(62vh, 520px)", borderRadius: 16, overflow: "hidden", background: "#000", marginBottom: 14, cursor: post.tipo === "foto" ? "zoom-in" : undefined }}
        onClick={() => post.tipo === "foto" && post.rutaOriginal && setAmpliada(true)}>
        {post.rutaOriginal && post.estado !== "subiendo" ? <ImagenStorage ruta={post.rutaOriginal} video={post.tipo === "video"} controles={post.tipo === "video"} contener /> : null}
      </div>
      {ampliada && post.rutaOriginal && <PantallaCompleta rutas={[post.rutaOriginal]} alCerrar={() => setAmpliada(false)} />}
      <div style={{ marginBottom: 16 }}>
        <div>
          <p style={{ fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 17 }}>{post.tipo === "video" ? "Video" : "Foto"}</p>
          <p className="sub" style={{ marginTop: 2 }}>{post.precio} monedas · {post.meGusta} me gusta · {post.comentarios ?? 0} {post.comentarios === 1 ? "comentario" : "comentarios"}{post.estado !== "aprobada" ? ` · ${ESTADO[post.estado]}` : ""}{post.oculta ? " · Oculta por reportes" : ""}</p>
          {post.estado === "rechazada" && post.motivoRechazo && <p style={{ fontSize: 12, color: "var(--rojo)", marginTop: 2 }}>Motivo: {post.motivoRechazo}</p>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 }}>
        <div style={{ background: "var(--surface2)", borderRadius: 12, padding: 12 }}><p className="lbl" style={{ margin: 0 }}>Aciertan</p><p style={{ fontFamily: "var(--f-display)", fontSize: 22, fontWeight: 700, marginTop: 4 }}>{post.intentos ? `${aciertan}%` : "—"}</p></div>
        <div style={{ background: "var(--surface2)", borderRadius: 12, padding: 12 }}><p className="lbl" style={{ margin: 0 }}>Ganado</p><p style={{ fontFamily: "var(--f-display)", fontSize: 22, fontWeight: 700, marginTop: 4, color: "var(--verde)" }}>{FASE_PRUEBA ? <><Ic n="coin" /> {nf(post.monedasRecibidas ?? 0)}</> : dinero(ganado)}</p></div>
      </div>
      <Interacciones postId={post.id} meGusta={post.meGusta} comentarios={post.comentarios ?? 0} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p className="lbl">Tu pregunta</p>
        {preguntas?.length && !editando ? <button style={{ fontWeight: 700, fontSize: 13, color: "var(--rosa)", marginTop: 14 }} onClick={() => setEditando(true)}><Ic n="pencil" /> Editar</button> : null}
      </div>
      {preguntas === null ? <p className="sub">Cargando…</p> : editando && preguntas[0] ? (
        <EditarPregunta postId={post.id} actual={preguntas[0]} alTerminar={(q) => { if (q) setPreguntas([{ ...preguntas[0], texto: q.texto, respuesta: q.correcta, falsas: q.falsas }]); setEditando(false); }} />
      ) : preguntas.slice(0, 1).map((q, k) => (
        <p key={k} style={{ fontSize: 14, padding: "7px 0" }}>{q.texto} <span style={{ color: "var(--verde)", fontSize: 12 }}>→ {q.respuesta}</span></p>
      ))}
      {confirmar ? (
        <>
          <p className="sub" style={{ textAlign: "center", marginTop: 18 }}>
            {post.estado === "aprobada" && post.desbloqueos > 0
              ? `Saldrá del feed y nadie más podrá desbloquearla. Las ${post.desbloqueos} personas que ya la desbloquearon la conservan.`
              : "Se borrará para siempre."}
          </p>
          <button className="btn danger" style={{ marginTop: 10 }} disabled={ocupado} onClick={async () => {
            setOcupado(true);
            try {
              await api.eliminarPublicacion({ postId: post.id });
              alEliminar();
              cerrarHoja();
              aviso("Publicación eliminada");
            } catch (e) {
              aviso(errorDe(e).mensaje);
              setOcupado(false);
            }
          }}>{ocupado ? "Eliminando…" : "Sí, eliminar"}</button>
          <button className="btn soft" style={{ marginTop: 8 }} onClick={() => setConfirmar(false)}>Cancelar</button>
        </>
      ) : (
        <button style={{ display: "block", width: "100%", textAlign: "center", fontWeight: 700, fontSize: 14, color: "var(--rojo)", padding: 12, marginTop: 14 }} onClick={() => setConfirmar(true)}>
          <Ic n="x" /> Eliminar publicación
        </button>
      )}
    </>
  );
}

type Persona = { id: string; username: string; avatarUrl: string | null };

/** Quién dio me gusta y quién comentó en una publicación mía (tocar a alguien abre sus publicaciones). */
function Interacciones({ postId, meGusta, comentarios }: { postId: string; meGusta: number; comentarios: number }) {
  const { ir } = useNav();
  const [tab, setTab] = useState<"likes" | "coms">("likes");
  const [likes, setLikes] = useState<Persona[] | null>(null);
  const [totalComs, setTotalComs] = useState(comentarios);

  useEffect(() => {
    const personas = new Map<string, Promise<Persona>>();
    const persona = (id: string) => {
      if (!personas.has(id)) personas.set(id, getDoc(doc(db, "users", id)).then((u) => ({ id, username: u.get("username") ?? "usuario", avatarUrl: u.get("avatarUrl") ?? null })));
      return personas.get(id)!;
    };
    getDocs(query(collection(db, "posts", postId, "meGusta"), limit(100)))
      .then((s) => Promise.all(s.docs.map((d) => persona(d.id))))
      .then(setLikes, () => setLikes([]));
  }, [postId]);

  const abrir = (id: string) => ir(id === auth.currentUser?.uid ? { n: "perfil" } : { n: "creador", id });
  return (
    <>
      <div className="seg" style={{ margin: "16px 0 6px" }} role="tablist">
        <button className={tab === "likes" ? "on" : ""} role="tab" aria-selected={tab === "likes"} onClick={() => setTab("likes")}><Ic n="heart" lleno /> {nf(meGusta)} me gusta</button>
        <button className={tab === "coms" ? "on" : ""} role="tab" aria-selected={tab === "coms"} onClick={() => setTab("coms")}><Ic n="msg" /> {nf(totalComs)} {totalComs === 1 ? "comentario" : "comentarios"}</button>
      </div>
      {tab === "coms" ? <HiloComentarios postId={postId} alCambiar={setTotalComs} /> : likes === null ? <p className="sub">Cargando…</p> : likes.length === 0 ? (
        <p className="sub" style={{ textAlign: "center", padding: "14px 0" }}>Aún nadie dio me gusta.</p>
      ) : likes.map((p) => (
        <button key={p.id} className="lrow" style={{ width: "100%", textAlign: "left" }} onClick={() => abrir(p.id)}>
          <Avatar url={p.avatarUrl} tam={38} />
          <p style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>@{p.username}</p>
          <span style={{ color: "var(--rosa)" }}><Ic n="heart" lleno /></span>
        </button>
      ))}
    </>
  );
}

function EditarPregunta({ postId, actual, alTerminar }: {
  postId: string;
  actual: { texto: string; respuesta: string; falsas: string[] };
  alTerminar: (q: PreguntaNueva | null) => void;
}) {
  const { aviso } = useNav();
  const [q, setQ] = useState({ texto: actual.texto, correcta: actual.respuesta, f1: actual.falsas[0] ?? "", f2: actual.falsas[1] ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof q, v: string) => setQ((x) => ({ ...x, [k]: v }));
  const resp = [q.correcta, q.f1, q.f2].map((x) => x.trim().toLowerCase());
  const ok = q.texto.trim().length >= 3 && resp.every(Boolean) && new Set(resp).size === 3;

  async function guardar() {
    if (!ok || guardando) return;
    setGuardando(true);
    setError(null);
    const pregunta: PreguntaNueva = { texto: q.texto.trim(), correcta: q.correcta.trim(), falsas: [q.f1.trim(), q.f2.trim()] };
    try {
      await api.editarPregunta({ postId, pregunta });
      aviso("Pregunta actualizada");
      alTerminar(pregunta);
    } catch (e) {
      setError(errorDe(e).mensaje);
      setGuardando(false);
    }
  }

  return (
    <>
      <textarea className="field" maxLength={90} aria-label="Pregunta" value={q.texto} onChange={(e) => set("texto", e.target.value)} />
      <p style={{ textAlign: "right", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{q.texto.length}/90</p>
      <div className="field"><span style={{ color: "var(--verde)" }}><Ic n="check" /></span><input maxLength={30} placeholder="La verdadera" aria-label="Respuesta correcta" value={q.correcta} onChange={(e) => set("correcta", e.target.value)} /></div>
      <div className="field" style={{ marginTop: 8 }}><span style={{ color: "var(--rojo)" }}><Ic n="x" /></span><input maxLength={30} placeholder="Falsa 1" aria-label="Respuesta falsa 1" value={q.f1} onChange={(e) => set("f1", e.target.value)} /></div>
      <div className="field" style={{ marginTop: 8 }}><span style={{ color: "var(--rojo)" }}><Ic n="x" /></span><input maxLength={30} placeholder="Falsa 2" aria-label="Respuesta falsa 2" value={q.f2} onChange={(e) => set("f2", e.target.value)} /></div>
      {error && <p role="alert" style={{ fontSize: 13, color: "var(--rojo)", marginTop: 10, textAlign: "center" }}>{error}</p>}
      {!ok && resp.every(Boolean) && <p style={{ fontSize: 12, color: "var(--rojo)", marginTop: 8 }}>Las tres respuestas deben ser distintas</p>}
      <button className={`btn ${ok && !guardando ? "grad" : "off"}`} style={{ marginTop: 12 }} onClick={guardar}>{guardando ? "Guardando…" : "Guardar pregunta"}</button>
      <button className="btn soft" style={{ marginTop: 8 }} onClick={() => alTerminar(null)}>Cancelar</button>
    </>
  );
}

const ESTADO_REEL: Record<string, string> = { subiendo: "Procesando…", revision: "En revisión", rechazado: "Rechazado", oculto: "Oculto por reportes" };

/** Mis reels: se abren en el visor de reels; los que fallaron se pueden borrar. */
function MisReels({ uid }: { uid: string }) {
  const { ir, abrirHoja } = useNav();
  const [reels, setReels] = useState<Reel[] | null>(null);
  // En vivo: un reel recién subido pasa de "Procesando" a publicado solo.
  useEffect(() => onSnapshot(query(collection(db, "reels"), where("autorId", "==", uid), orderBy("creadoEn", "desc")), (s) =>
    setReels(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Reel)), () => setReels([]),
  ), [uid]);
  if (!reels) return <Cargando />;
  if (!reels.length) return (
    <div style={{ textAlign: "center", padding: "36px 10px" }}>
      <p className="sub">Aún no subes reels. Son gratis: sube un video y anima a la gente a jugar con tus fotos.</p>
      <button className="btn soft" style={{ marginTop: 14 }} onClick={() => ir({ n: "crearReel" })}><Ic n="film" /> Crear reel</button>
    </div>
  );
  return (
    <div className="grid3">
      {reels.map((r) => (
        <button key={r.id} className="cell" style={{ aspectRatio: "9/16" }} aria-label="Reel"
          onClick={() => r.estado === "publicado" ? ir({ n: "reels", autorId: uid, reelId: r.id }) : abrirHoja(<HojaEditarReel reel={r} />)}>
          {r.rutaPortada ? <ImagenStorage ruta={r.rutaPortada} /> : <div style={{ width: "100%", height: "100%", background: "var(--surface2)" }} />}
          {r.estado !== "publicado" && <span className="c" style={{ top: 6, left: 6, background: "rgba(0,0,0,.55)", padding: "2px 6px", borderRadius: 6 }}>{ESTADO_REEL[r.estado] ?? r.estado}</span>}
          <span className="c" style={{ left: 6, bottom: 6 }}><Ic n="play" lleno /></span>
          <span className="c" style={{ right: 6, bottom: 6 }}><Ic n="heart" lleno />{r.meGusta}</span>
        </button>
      ))}
    </div>
  );
}

function Coleccion({ uid }: { uid: string }) {
  const { ir, aviso } = useNav();
  const [ampliada, setAmpliada] = useState<number | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [items, setItems] = useState<{ postId: string; creadorId: string; ruta: string | null; usuario: string; eliminada: boolean; video: boolean; original: string | null }[] | null>(null);
  useEffect(() => {
    (async () => {
      const s = await getDocs(query(collection(db, "users", uid, "desbloqueos"), orderBy("creadoEn", "desc")));
      const nombres = new Map<string, string>();
      const lista = await Promise.all(s.docs.filter((d) => d.get("oculta") !== true).map(async (d) => {
        const creadorId = d.get("creadorId") as string;
        if (!nombres.has(creadorId)) nombres.set(creadorId, (await getDoc(doc(db, "users", creadorId))).get("username") ?? "");
        const p = await getDoc(doc(db, "posts", d.id)).catch(() => null);
        return { postId: d.id, creadorId, ruta: p?.exists() ? (p.get("tipo") === "video" ? p.get("rutaBorrosa") : p.get("rutaOriginal")) : null, usuario: nombres.get(creadorId)!, eliminada: p?.get("estado") === "eliminada", video: p?.get("tipo") === "video", original: p?.exists() ? p.get("rutaOriginal") : null };
      }));
      setItems(lista.filter((x) => x.ruta && x.original));
    })();
  }, [uid]);
  // Borrar de la colección solo la oculta aquí: sigue desbloqueada en el perfil del creador.
  async function borrar(i: number) {
    const x = items![i];
    try {
      await updateDoc(doc(db, "users", uid, "desbloqueos", x.postId), { oculta: true });
      const resto = items!.filter((_, n) => n !== i);
      setItems(resto);
      setConfirmar(false);
      setAmpliada(resto.length ? Math.min(i, resto.length - 1) : null);
      aviso(x.video ? "Video borrado de tu colección" : "Foto borrada de tu colección");
    } catch (e) {
      aviso(errorDe(e).mensaje);
    }
  }
  if (!items) return <Cargando />;
  if (!items.length) return <p className="sub" style={{ textAlign: "center", padding: "40px 0" }}>Aún no desbloqueas fotos.</p>;
  return (
    <>
      <p className="sub" style={{ margin: "0 2px 10px" }}>Fotos que desbloqueaste, jugando o pagando.</p>
      <div className="grid3">
        {items.map((x, i) => (
          <button key={x.postId} className="cell" aria-label={`Foto de @${x.usuario}`} onClick={() => setAmpliada(i)}>
            <ImagenStorage ruta={x.ruta} />
            {x.video && <span className="c" style={{ top: 6, right: 6 }}><Ic n="play" lleno /></span>}
            <span className="c" style={{ left: 6, bottom: 6 }}>@{x.usuario}</span>
          </button>
        ))}
      </div>
      {ampliada !== null && (
        <PantallaCompleta key={items.length} rutas={items.map((x) => x.original!)} inicio={ampliada} alCerrar={() => { setAmpliada(null); setConfirmar(false); }}
          videos={new Set(items.filter((x) => x.video).map((x) => x.original!))}
          etiqueta={(i) => {
            const x = items[i];
            const pildora = { color: "#fff", fontWeight: 700, fontSize: 14, background: "rgba(255,255,255,.14)", padding: "7px 12px", borderRadius: 999 };
            return (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button style={pildora} onClick={() => x.eliminada ? undefined : ir({ n: "creador", id: x.creadorId, postId: x.postId })}>@{x.usuario}{x.eliminada ? "" : " ›"}</button>
                {confirmar ? (
                  <>
                    <button style={{ ...pildora, background: "var(--rojo)" }} onClick={() => borrar(i)}>Borrar de mi colección</button>
                    <button style={pildora} onClick={() => setConfirmar(false)}>Cancelar</button>
                  </>
                ) : <button style={pildora} aria-label="Borrar de mi colección" onClick={() => setConfirmar(true)}><Ic n="trash" /> Borrar</button>}
              </div>
            );
          }} />
      )}
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
          <Avatar url={c.avatarUrl} tam={46} ampliable />
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
