import { useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, type QueryConstraint } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { api, errorDe } from "../api";
import { Avatar, Barra, BotonesFlotantes, claseEntrada, HiloComentarios, HojaCompartir, PildoraMonedas, TituloHoja, HojaOpcionesUsuario } from "../componentes";
import { auth, db, storage } from "../firebase";
import { Ic } from "../iconos";
import { useNav } from "../nav";
import { useSesion } from "../sesion";
import { duracionVideo, nf } from "../util";

export type Reel = { id: string; autorId: string; texto: string; estado: string; rutaVideo: string | null; rutaPortada: string | null; meGusta: number; comentarios?: number };
type Autor = { username: string; avatarUrl: string | null; incognito: boolean };

const MAX_SEGUNDOS = 60;
const MAX_TEXTO = 150;

// Las URLs de los reels (con token) se piden una vez y se reutilizan.
const urls = new Map<string, Promise<string>>();
const urlDe = (ruta: string) => {
  if (!urls.has(ruta)) urls.set(ruta, getDownloadURL(ref(storage, ruta)).catch((e) => { urls.delete(ruta); throw e; }));
  return urls.get(ruta)!;
};
const autores = new Map<string, Promise<Autor>>();
const autorDe = (id: string) => {
  if (!autores.has(id)) autores.set(id, getDoc(doc(db, "users", id)).then((u) => ({ username: u.get("username") ?? "usuario", avatarUrl: u.get("avatarUrl") ?? null, incognito: u.get("incognito") === true })));
  return autores.get(id)!;
};

/**
 * Reels: videos gratis a pantalla completa, uno por pantalla. Sirven para que
 * los creadores se den a conocer e inviten a jugar con sus fotos.
 * Con `autorId` muestra solo los de esa persona (desde su perfil).
 */
export function Reels({ autorId, reelId }: { autorId?: string; reelId?: string }) {
  const { volver } = useNav();
  const [lista, setLista] = useState<Reel[] | null>(null);
  const [sonido, setSonido] = useState(false);
  const [entrada] = useState(claseEntrada);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cs: QueryConstraint[] = autorId
      ? [where("autorId", "==", autorId), where("estado", "==", "publicado"), orderBy("creadoEn", "desc"), limit(50)]
      : [where("estado", "==", "publicado"), orderBy("creadoEn", "desc"), limit(30)];
    getDocs(query(collection(db, "reels"), ...cs)).then(
      (s) => setLista(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Reel)),
      () => setLista([]),
    );
  }, [autorId]);

  // Reels de autores en modo incógnito: no salen en la sección general (sí desde su perfil).
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (autorId || !lista?.length) return;
    const ids = [...new Set(lista.map((r) => r.autorId))];
    Promise.all(ids.map((id) => autorDe(id).then((a) => (a.incognito && id !== auth.currentUser?.uid ? id : null), () => null)))
      .then((r) => setOcultos(new Set(r.filter((x): x is string => !!x))));
  }, [lista, autorId]);

  // Si se abrió desde un reel concreto, empieza en él.
  useEffect(() => {
    if (!lista || !reelId) return;
    const i = lista.findIndex((r) => r.id === reelId);
    if (i > 0) caja.current?.scrollTo({ top: i * caja.current.clientHeight });
  }, [lista, reelId]);

  const { bloqueados } = useSesion();
  const quitar = (id: string) => setLista((l) => l && l.filter((r) => r.id !== id));
  const cambiar = (r: Reel) => setLista((l) => l && l.map((x) => (x.id === r.id ? r : x)));

  return (
    <>
      <div className={`reels ${entrada}`} ref={caja}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 3, display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", color: "#fff" }}>
          {autorId && <button className="iconbtn" style={{ color: "#fff" }} onClick={volver} aria-label="Volver"><Ic n="back" /></button>}
          <p style={{ fontFamily: "var(--f-display)", fontWeight: 800, fontSize: 26, flex: 1, textShadow: "0 1px 4px rgba(0,0,0,.5)" }}>Reels</p>
          <PildoraMonedas />
        </div>
        {lista === null ? (
          <div className="tarjeta-reel" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ opacity: 0.7 }}>Cargando…</p></div>
        ) : lista.length === 0 ? (
          <div className="tarjeta-reel" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 30 }}>
            <span style={{ fontSize: 44, opacity: 0.8 }}><Ic n="film" /></span>
            <p className="h2" style={{ color: "#fff", marginTop: 12 }}>{autorId ? "Aún no hay reels aquí" : "Aún no hay reels"}</p>
            <p style={{ opacity: 0.75, fontSize: 14, marginTop: 6 }}>Sube un video gratis y cuenta qué hay detrás de tus fotos borrosas. Toca + para crear el primero.</p>
          </div>
        ) : lista.filter((r) => !bloqueados.has(r.autorId) && !ocultos.has(r.autorId)).map((r) => (
          <TarjetaReel key={r.id} reel={r} sonido={sonido} alSonido={() => setSonido((s) => !s)} alEliminar={() => quitar(r.id)} alEditar={cambiar} />
        ))}
      </div>
      <BotonesFlotantes seccion="reels" />
    </>
  );
}

function TarjetaReel({ reel, sonido, alSonido, alEliminar, alEditar }: {
  reel: Reel; sonido: boolean; alSonido: () => void; alEliminar: () => void; alEditar: (r: Reel) => void;
}) {
  const { ir, abrirHoja, aviso } = useNav();
  const uid = auth.currentUser!.uid;
  const mio = reel.autorId === uid;
  const tarjeta = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [cerca, setCerca] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [portada, setPortada] = useState<string | null>(null);
  const [autor, setAutor] = useState<Autor | null>(null);
  const [like, setLike] = useState<boolean | null>(null);
  const [cuenta, setCuenta] = useState(reel.meGusta);
  const [comentarios, setComentarios] = useState(reel.comentarios ?? 0);

  useEffect(() => { autorDe(reel.autorId).then(setAutor, () => {}); }, [reel.autorId]);
  useEffect(() => { if (reel.rutaPortada) urlDe(reel.rutaPortada).then(setPortada, () => {}); }, [reel.rutaPortada]);
  useEffect(() => { getDoc(doc(db, "reels", reel.id, "meGusta", uid)).then((s) => setLike(s.exists()), () => setLike(false)); }, [reel.id, uid]);

  // Solo se reproduce el reel que está en pantalla; el video se carga al acercarse.
  useEffect(() => {
    const el = tarjeta.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setCerca(true);
      setVisible(e.intersectionRatio >= 0.6);
    }, { threshold: [0, 0.6, 1], rootMargin: "100% 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  useEffect(() => { if (cerca && reel.rutaVideo) urlDe(reel.rutaVideo).then(setSrc, () => {}); }, [cerca, reel.rutaVideo]);
  useEffect(() => { if (video.current) video.current.muted = !sonido; }, [sonido, src]);
  // Reproducción automática: al entrar en pantalla empieza desde el principio; al salir se pausa.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (visible) {
      v.currentTime = 0;
      // iPhone no deja reproducir solo con sonido sin un toque: si lo rechaza, arranca en silencio.
      v.play().then(() => setPausado(false), () => {
        v.muted = true;
        v.play().then(() => setPausado(false), () => setPausado(true));
      });
    } else v.pause();
  }, [visible, src]);

  function alternarPlay() {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().then(() => setPausado(false), () => {});
    else { v.pause(); setPausado(true); }
  }

  async function alternarLike() {
    if (like === null) return;
    const v = !like;
    setLike(v);
    setCuenta((c) => c + (v ? 1 : -1));
    try {
      await api.meGustaReel({ reelId: reel.id, valor: v });
    } catch (e) {
      setLike(!v);
      setCuenta((c) => c + (v ? -1 : 1));
      aviso(errorDe(e).mensaje);
    }
  }

  const jugar = () => ir(mio ? { n: "perfil" } : { n: "creador", id: reel.autorId });

  return (
    <div className="tarjeta-reel" ref={tarjeta}>
      {portada && <img className="portada" src={portada} alt="" />}
      {src && <video ref={video} src={src} poster={portada ?? undefined} loop playsInline muted={!sonido} preload="metadata" onClick={alternarPlay} />}
      <div className="sombra" />
      {pausado && (
        <button aria-label="Reproducir" onClick={alternarPlay}
          style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", zIndex: 2, width: 72, height: 72, borderRadius: "50%", background: "rgba(0,0,0,.45)", color: "#fff", fontSize: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Ic n="play" lleno />
        </button>
      )}
      <button aria-label={sonido ? "Silenciar" : "Activar sonido"} onClick={alSonido}
        style={{ position: "absolute", top: 64, right: 14, zIndex: 3, width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,.4)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
        <Ic n={sonido ? "vol" : "mute"} />
      </button>

      <div className="lado">
        <button onClick={alternarPlay} aria-label={pausado ? "Reproducir" : "Pausar"}><Ic n={pausado ? "play" : "pause"} lleno={pausado} /><small>{pausado ? "Play" : "Pausa"}</small></button>
        <button onClick={alternarLike} aria-label="Me gusta" style={{ color: like ? "var(--rosa)" : "#fff" }}><Ic n="heart" lleno={!!like} /><small style={{ color: "#fff" }}>{nf(cuenta)}</small></button>
        <button aria-label="Comentarios" onClick={() => abrirHoja(
          <>
            <TituloHoja>Comentarios</TituloHoja>
            <HiloComentarios postId={reel.id} coleccion="reels" alCambiar={setComentarios} />
          </>,
        )}><Ic n="msg" /><small>{nf(comentarios)}</small></button>
        {autor && <button onClick={() => abrirHoja(<HojaCompartir username={autor.username} propio={mio} />)} aria-label="Compartir"><Ic n="share" /><small>Compartir</small></button>}
        {!mio && autor && <button onClick={() => abrirHoja(<HojaOpcionesUsuario uid={reel.autorId} username={autor.username} reporte={{ tipo: "reel", id: reel.id }} />)} aria-label="Más opciones"><Ic n="dots" /><small>Más</small></button>}
        {mio && <button onClick={() => abrirHoja(<HojaEditarReel reel={reel} alEditar={alEditar} alEliminar={alEliminar} />)} aria-label="Editar reel"><Ic n="dots" /><small>Editar</small></button>}
      </div>

      <div className="info">
        <button onClick={jugar} style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff" }}>
          <Avatar url={autor?.avatarUrl} tam={36} />
          <b style={{ fontSize: 15 }}>@{autor?.username ?? "…"}</b>
        </button>
        {reel.texto && <p style={{ fontSize: 14, lineHeight: 1.4, marginTop: 8, overflowWrap: "anywhere", textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>{reel.texto}</p>}
        {!mio && (
          <button className="btn grad" style={{ height: 42, marginTop: 12, width: "auto", padding: "0 18px", display: "inline-flex" }} onClick={jugar}>
            <Ic n="gamepad" /> Jugar con @{autor?.username ?? "…"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Editar el texto de un reel propio, o eliminarlo. */
export function HojaEditarReel({ reel, alEditar, alEliminar }: { reel: Reel; alEditar?: (r: Reel) => void; alEliminar?: () => void }) {
  const { cerrarHoja, aviso } = useNav();
  const [texto, setTexto] = useState(reel.texto);
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function guardar() {
    setOcupado(true);
    try {
      await api.editarReel({ reelId: reel.id, texto: texto.trim() });
      alEditar?.({ ...reel, texto: texto.trim() });
      cerrarHoja();
      aviso("Reel actualizado");
    } catch (e) {
      aviso(errorDe(e).mensaje);
      setOcupado(false);
    }
  }
  async function eliminar() {
    setOcupado(true);
    try {
      await api.eliminarReel({ reelId: reel.id });
      alEliminar?.();
      cerrarHoja();
      aviso("Reel eliminado");
    } catch (e) {
      aviso(errorDe(e).mensaje);
      setOcupado(false);
    }
  }

  return (
    <>
      <TituloHoja>Editar reel</TituloHoja>
      <textarea className="field" maxLength={MAX_TEXTO} placeholder="Cuenta algo de tus fotos e invita a jugar" aria-label="Texto del reel" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <p style={{ textAlign: "right", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{texto.length}/{MAX_TEXTO}</p>
      <button className={`btn ${ocupado ? "off" : "grad"}`} style={{ marginTop: 10 }} onClick={guardar} disabled={ocupado}>Guardar</button>
      {confirmar ? (
        <>
          <p className="sub" style={{ textAlign: "center", marginTop: 16 }}>Se borrará el video para siempre.</p>
          <button className="btn danger" style={{ marginTop: 8 }} onClick={eliminar} disabled={ocupado}>{ocupado ? "Eliminando…" : "Sí, eliminar reel"}</button>
          <button className="btn soft" style={{ marginTop: 8 }} onClick={() => setConfirmar(false)}>Cancelar</button>
        </>
      ) : (
        <button style={{ display: "block", width: "100%", textAlign: "center", fontWeight: 700, fontSize: 14, color: "var(--rojo)", padding: 12, marginTop: 8 }} onClick={() => setConfirmar(true)}>
          <Ic n="x" /> Eliminar reel
        </button>
      )}
    </>
  );
}

/** Subir un reel: un video de hasta 60 segundos y un texto opcional. Es gratis. */
export function CrearReel() {
  const { ir, reiniciar, abrirHoja } = useNav();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function elegir(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("video/")) return setError("Elige un video.");
    if (f.size > 100 * 1024 * 1024) return setError("El video pesa más de 100 MB.");
    try {
      const s = await duracionVideo(f);
      if (s > MAX_SEGUNDOS + 0.5) return setError(`El video dura ${Math.round(s)} segundos; el máximo es ${MAX_SEGUNDOS}.`);
    } catch {
      return setError("No se pudo leer ese video.");
    }
    setArchivo(f);
    setVista(URL.createObjectURL(f));
  }

  async function publicar() {
    if (!archivo || progreso !== null) return;
    setError(null);
    setProgreso(0);
    try {
      const { ruta } = await api.crearReel({ texto: texto.trim() });
      const tarea = uploadBytesResumable(ref(storage, ruta), archivo, { contentType: archivo.type || "video/mp4" });
      tarea.on("state_changed", (s) => setProgreso(s.bytesTransferred / s.totalBytes));
      await tarea;
      abrirHoja(
        <>
          <div style={{ textAlign: "center", paddingTop: 6 }}>
            <span style={{ display: "inline-flex", width: 72, height: 72, borderRadius: "50%", background: "var(--grad)", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 34, animation: "pop .45s ease" }}><Ic n="film" /></span>
            <p className="h2" style={{ fontSize: 22, marginTop: 14 }}>¡Reel subido!</p>
            <p className="sub">Estará listo en unos segundos, mientras lo preparamos.</p>
          </div>
          <button className="btn dark" style={{ marginTop: 18 }} onClick={() => { reiniciar({ n: "feed" }); ir({ n: "perfil" }); }}>Ver mis reels</button>
          <button className="btn soft" style={{ marginTop: 8 }} onClick={() => reiniciar({ n: "reels" })}>Ir a Reels</button>
        </>,
      );
    } catch (e) {
      setError(errorDe(e).mensaje);
      setProgreso(null);
    }
  }

  return (
    <>
      <Barra titulo="Nuevo reel" icono="x" />
      <div role="button" tabIndex={0} onClick={() => !archivo && input.current?.click()} onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
        style={{ position: "relative", marginTop: 6, aspectRatio: "9/14", maxHeight: "58vh", marginInline: "auto", borderRadius: 18, overflow: "hidden", background: "var(--surface2)", cursor: "pointer" }}>
        {vista ? (
          <>
            <video src={vista} muted playsInline loop autoPlay controls style={{ width: "100%", height: "100%", objectFit: "cover", background: "#000" }} />
            <button className="pill" style={{ position: "absolute", right: 10, top: 10, background: "rgba(20,14,18,.65)", color: "#fff" }} onClick={(e) => { e.stopPropagation(); input.current?.click(); }}>Cambiar</button>
          </>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center", padding: 20 }}>
            <span style={{ width: 56, height: 56, borderRadius: 16, background: "var(--grad)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 26 }}><Ic n="film" /></span>
            <b>Seleccionar video</b>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Gratis · máx. {MAX_SEGUNDOS} segundos · vertical se ve mejor</span>
          </div>
        )}
        <input ref={input} type="file" accept="video/*" hidden onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      <p className="lbl">Texto</p>
      <textarea className="field" maxLength={MAX_TEXTO} placeholder="Ej: ¿Adivinas dónde estaba? Juega conmigo y descúbrelo 👀" aria-label="Texto del reel" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <p style={{ textAlign: "right", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{texto.length}/{MAX_TEXTO}</p>
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Los reels son gratis para todos. En cada uno aparece un botón para jugar con tus fotos.</p>

      {error && <p role="alert" style={{ textAlign: "center", fontSize: 13, color: "var(--rojo)", marginTop: 16 }}>{error}</p>}
      <p style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", margin: "22px 0 8px" }}>
        {progreso !== null ? `Subiendo… ${Math.round(progreso * 100)}%` : archivo ? "Listo para publicar" : "Falta el video"}
      </p>
      <button className={`btn ${archivo && progreso === null ? "grad" : "off"}`} onClick={publicar}>Publicar reel</button>
    </>
  );
}
