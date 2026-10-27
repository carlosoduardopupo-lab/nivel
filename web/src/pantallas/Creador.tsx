import { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, type Timestamp } from "firebase/firestore";
import { api, errorDe, type Pregunta } from "../api";
import { Barra, Cargando, Corazones, ImagenStorage, PildoraMonedas, TituloHoja, Avatar } from "../componentes";
import { auth, db } from "../firebase";
import { Ic } from "../iconos";
import { useNav } from "../nav";
import { useSesion, vidasAhora } from "../sesion";
import { diaDe, fmtFalta, monedasTxt, nf } from "../util";

type Post = {
  id: string;
  orden: number;
  tipo: "foto" | "video";
  precio: number;
  tiempo: number;
  rutaOriginal: string;
  rutaBorrosa: string | null;
  meGusta: number;
  comentarios: number;
};

type Intento = {
  preguntasUsadas: number;
  ultimoDia: string | null;
  inicioEn: Timestamp | null;
  pendiente: boolean;
  resultado: "fallo" | "tiempo" | "acierto" | "pago" | null;
};

const MARGEN = 2000;

export function Creador({ id, postId }: { id: string; postId?: string }) {
  const { privado } = useSesion();
  const { ir, abrirHoja, aviso } = useNav();
  const uid = auth.currentUser!.uid;
  const [creador, setCreador] = useState<{ username: string; avatarUrl: string | null } | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [desb, setDesb] = useState<Set<string>>(new Set());
  const [intentos, setIntentos] = useState<Record<string, Intento>>({});
  const [idx, setIdx] = useState<number | null>(null);
  const [activa, setActiva] = useState<{ postId: string; p: Pregunta } | null>(null);
  const [restante, setRestante] = useState(1);
  const [revelar, setRevelar] = useState<{ texto: string; desvanecer: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [ahora, setAhora] = useState(Date.now());
  const enviado = useRef(false);

  const recargar = useCallback(async () => {
    const [u, ps, ds, is] = await Promise.all([
      getDoc(doc(db, "users", id)),
      getDocs(query(collection(db, "posts"), where("creadorId", "==", id), where("estado", "==", "aprobada"), where("oculta", "==", false), orderBy("orden"))),
      getDocs(query(collection(db, "users", uid, "desbloqueos"), where("creadorId", "==", id))),
      getDocs(query(collection(db, "users", uid, "intentos"), where("creadorId", "==", id))),
    ]);
    setCreador(u.exists() ? { username: u.get("username"), avatarUrl: u.get("avatarUrl") } : null);
    const lista = ps.docs.map((d) => ({ id: d.id, ...d.data() }) as Post);
    const abiertas = new Set(ds.docs.map((d) => d.id));
    setPosts(lista);
    setDesb(abiertas);
    setIntentos(Object.fromEntries(is.docs.map((d) => [d.id, d.data() as Intento])));
    return { lista, abiertas };
  }, [id, uid]);

  useEffect(() => {
    recargar().then(({ lista, abiertas }) => {
      const pedido = postId ? lista.findIndex((p) => p.id === postId) : -1;
      const siguiente = lista.findIndex((p) => !abiertas.has(p.id));
      setIdx(pedido >= 0 ? pedido : siguiente >= 0 ? siguiente : Math.max(0, lista.length - 1));
    });
  }, [recargar, postId]);

  // Reloj: temporizador de la pregunta y cuenta atrás de las vidas.
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const siguiente = posts ? posts.findIndex((p) => !desb.has(p.id)) : -1;
  const post = posts && idx !== null ? posts[idx] : null;
  const abierta = post ? desb.has(post.id) : false;
  const vidas = vidasAhora(privado, ahora);

  const responder = useCallback(async (opcion: number) => {
    if (!activa || enviado.current) return;
    enviado.current = true;
    try {
      const r = await api.responder({ postId: activa.postId, opcion });
      setActiva(null);
      if (r.correcta) aviso("¡Acertaste! La foto es tuya");
      await recargar();
    } catch (e) {
      aviso(errorDe(e).mensaje);
      setActiva(null);
      await recargar();
    }
  }, [activa, aviso, recargar]);

  // Tiempo restante de la pregunta abierta (sin el margen del servidor).
  useEffect(() => {
    if (!activa) return;
    const total = activa.p.tiempo * 1000;
    const r = Math.max(0, (activa.p.venceEn - MARGEN - ahora) / total);
    setRestante(r);
    if (r <= 0) responder(-1);
  }, [activa, ahora, responder]);

  async function empezar(id = post?.id) {
    if (!id || ocupado) return;
    setOcupado(true);
    try {
      const p = await api.empezarPregunta({ postId: id });
      enviado.current = false;
      setActiva({ postId: id, p });
    } catch (e) {
      const { codigo, mensaje } = errorDe(e);
      aviso(mensaje);
      if (codigo !== "conexion") await recargar();
    } finally {
      setOcupado(false);
    }
  }

  async function pagar() {
    if (!post || ocupado) return;
    const monedas = privado?.monedas ?? 0;
    if (monedas < post.precio) {
      abrirHoja(
        <>
          <div style={{ textAlign: "center" }}>
            <span className="coin" style={{ margin: "0 auto" }}><Ic n="coin" /></span>
            <p className="h2" style={{ fontSize: 20, marginTop: 12 }}>Te faltan {post.precio - monedas} monedas</p>
            <p className="sub">Tienes {monedas}. Esta foto cuesta {post.precio}.</p>
          </div>
          <button className="btn grad" style={{ marginTop: 18 }} onClick={() => ir({ n: "tienda" })}>Ir a la tienda</button>
        </>,
      );
      return;
    }
    setOcupado(true);
    try {
      enviado.current = true;
      const r = await api.pagarRespuesta({ postId: post.id });
      setActiva(null);
      setRevelar({ texto: r.respuesta, desvanecer: false });
      setTimeout(() => setRevelar((x) => (x ? { ...x, desvanecer: true } : x)), 3000);
      setTimeout(() => setRevelar(null), 4900);
      await recargar();
    } catch (e) {
      aviso(errorDe(e).mensaje);
    } finally {
      setOcupado(false);
    }
  }

  /** Si la foto se puede jugar ahora mismo (sin pregunta fallada hoy y con vidas). */
  function puedeEmpezar(p: Post) {
    const it = intentos[p.id];
    if (it?.pendiente) return true;
    return it?.ultimoDia !== diaDe(new Date()) && vidasAhora(privado) > 0;
  }

  if (!posts || idx === null) return <><Barra titulo="" /><Cargando /></>;
  if (!creador) return <><Barra titulo="" /><p className="sub" style={{ textAlign: "center", padding: 40 }}>Este creador no existe.</p></>;
  if (id === uid) return <><Barra titulo={"@" + creador.username} /><p className="sub" style={{ textAlign: "center", padding: 40 }}>Estas son tus fotos. Míralas en tu perfil.</p></>;
  if (!post) return <><Barra titulo={"@" + creador.username} /><p className="sub" style={{ textAlign: "center", padding: 40 }}>Aún no tiene fotos publicadas.</p></>;

  const intento = intentos[post.id];
  const hoy = diaDe(new Date(ahora));
  const pendienteAbierta = !!intento?.pendiente && !!intento.inicioEn && intento.inicioEn.toMillis() + post.tiempo * 1000 + MARGEN > ahora;
  const usadas = intento?.preguntasUsadas ?? 0;
  const falloHoy = !pendienteAbierta && intento?.ultimoDia === hoy;
  const vuelvenEn = privado?.vidasVuelvenEn?.toMillis() ?? 0;
  const todoHecho = siguiente === -1;

  const textoPago = <><Ic n="coin" /> Ver respuesta · {monedasTxt(post.precio)}</>;

  let centro;
  if (activa?.postId === post.id) {
    centro = (
      <>
        <p className="q">{activa.p.numero > 1 ? "Pregunta nueva: " : ""}{activa.p.pregunta}</p>
        <div className="timer"><i style={{ width: `${restante * 100}%`, transition: "width .25s linear" }} /></div>
        {activa.p.opciones.map((o, i) => <button key={i} className="opt" onClick={() => responder(i)}>{o}</button>)}
      </>
    );
  } else if (falloHoy) {
    centro = (
      <>
        <p style={{ textAlign: "center", fontWeight: 700, fontSize: 16, color: "#FFB1AE" }}><Ic n="x" /> {intento?.resultado === "tiempo" ? "Se acabó el tiempo" : "Respuesta incorrecta"}</p>
        <p style={{ textAlign: "center", fontSize: 13, opacity: 0.85, marginTop: 4 }}>
          {vidas ? `Te quedan ${vidas} ${vidas === 1 ? "vida" : "vidas"} hoy.` : "Te quedaste sin vidas."} Mañana tendrás otra pregunta.
        </p>
      </>
    );
  } else if (vidas === 0) {
    centro = (
      <>
        <p style={{ textAlign: "center", fontWeight: 700, fontSize: 16 }}>Te quedaste sin vidas</p>
        <p style={{ textAlign: "center", fontSize: 13, opacity: 0.85, marginTop: 4 }}>Vuelven en <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmtFalta(vuelvenEn - ahora)}</b></p>
        <button className="btn soft" style={{ marginTop: 12, height: 44, background: "rgba(255,255,255,.14)", color: "#fff" }} onClick={() => ir({ n: "tienda" })}>Conseguir monedas</button>
      </>
    );
  } else {
    centro = (
      <>
        <p className="q" style={{ textAlign: "center" }}>{pendienteAbierta ? "Tienes una pregunta abierta" : usadas ? "Nueva pregunta" : "¿Lo conoces?"}</p>
        <p style={{ textAlign: "center", fontSize: 13, opacity: 0.85, margin: "4px 0 12px" }}>
          {pendienteAbierta ? "Corre, el tiempo sigue contando." : `Tendrás ${post.tiempo} segundos. Si fallas, gastas una vida.`}
        </p>
        <button className="opt" onClick={() => empezar()} disabled={ocupado}>{ocupado ? "Un momento…" : pendienteAbierta ? "Volver a la pregunta" : "Empezar"}</button>
      </>
    );
  }

  return (
    <>
      <Barra titulo={"@" + creador.username} derecha={<><Corazones vidas={vidas} /> <PildoraMonedas /></>} />
      <div className="reel">
        {posts.map((p, i) => {
          const ok = desb.has(p.id);
          const bloqueada = !ok && i !== siguiente;
          return (
            <button key={p.id} className={`thumb ${i === idx ? "cur" : ""}`} aria-label={`Foto ${i + 1}${ok ? "" : " bloqueada"}`} disabled={bloqueada || !!activa}
              style={bloqueada ? { cursor: "default" } : undefined} onClick={() => { setIdx(i); setRevelar(null); }}>
              <div style={{ width: "100%", height: "100%" }}><ImagenStorage ruta={ok ? (p.tipo === "video" ? p.rutaBorrosa : p.rutaOriginal) : p.rutaBorrosa} /></div>
              {!ok && <span className="lk"><Ic n="lock" /></span>}
            </button>
          );
        })}
      </div>

      <div className="stage">
        <button className="dots" aria-label="Reportar esta foto" onClick={() => abrirHoja(<HojaReporte postId={post.id} />)}><Ic n="dots" /></button>
        {abierta ? (
          <>
            <div className="art"><ImagenStorage ruta={post.rutaOriginal} video={post.tipo === "video"} controles={post.tipo === "video"} /></div>
            {revelar && (
              <div className="reveal" style={{ opacity: revelar.desvanecer ? 0 : 1 }}>
                <p style={{ fontSize: 12, opacity: 0.8 }}>La respuesta era</p>
                <p style={{ fontFamily: "var(--f-display)", fontSize: 22, fontWeight: 700 }}>{revelar.texto}</p>
              </div>
            )}
            <Lateral post={post} onComentarios={() => abrirHoja(<HojaComentarios postId={post.id} />)}
              siguiente={idx + 1 < posts.length && (desb.has(posts[idx + 1].id) || idx + 1 === siguiente) ? () => {
                const sig = posts[idx + 1];
                setIdx(idx + 1);
                setRevelar(null);
                // La flecha lleva directo a la pregunta de la siguiente foto, sin la pantalla de "¿Lo conoces?".
                if (!desb.has(sig.id) && puedeEmpezar(sig)) empezar(sig.id);
              } : undefined} />
          </>
        ) : (
          <>
            <div className="art blur"><ImagenStorage ruta={post.rutaBorrosa} /></div>
            <div className="overlay">
              {centro}
              <button className="paybtn" onClick={pagar} disabled={ocupado}>{textoPago}</button>
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        {abierta && todoHecho && idx === posts.length - 1 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, background: "var(--surface2)" }}>
            <span style={{ color: "var(--verde)", fontSize: 22 }}><Ic n="trophy" /></span>
            <p style={{ fontSize: 14 }}><b>Completaste a @{creador.username}.</b> Te avisamos cuando suba fotos nuevas.</p>
          </div>
        ) : !abierta ? (
          <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>{post.tiempo} segundos para responder · {monedasTxt(post.precio)}</p>
        ) : null}
      </div>
    </>
  );
}

function Lateral({ post, onComentarios, siguiente }: { post: Post; onComentarios: () => void; siguiente?: () => void }) {
  const { aviso } = useNav();
  const uid = auth.currentUser!.uid;
  const [like, setLike] = useState<boolean | null>(null);
  const [cuenta, setCuenta] = useState(post.meGusta);

  useEffect(() => {
    setCuenta(post.meGusta);
    setLike(null);
    getDoc(doc(db, "posts", post.id, "meGusta", uid)).then((s) => setLike(s.exists()));
  }, [post.id, post.meGusta, uid]);

  async function alternar() {
    if (like === null) return;
    const v = !like;
    setLike(v);
    setCuenta((c) => c + (v ? 1 : -1));
    try {
      await api.darMeGusta({ postId: post.id, valor: v });
    } catch (e) {
      setLike(!v);
      setCuenta((c) => c - (v ? 1 : -1));
      aviso(errorDe(e).mensaje);
    }
  }

  return (
    <div className="side">
      <div><button className={like ? "liked" : ""} aria-pressed={!!like} aria-label="Me gusta" onClick={alternar}><Ic n="heart" lleno={!!like} /></button><small>{nf(cuenta)}</small></div>
      <div><button aria-label="Comentarios" onClick={onComentarios}><Ic n="msg" /></button><small>{nf(post.comentarios ?? 0)}</small></div>
      {siguiente && <button className="nudge" aria-label="Siguiente foto" onClick={siguiente}><Ic n="arrow" /></button>}
    </div>
  );
}

type Comentario = { id: string; username: string; texto: string };

function HojaComentarios({ postId }: { postId: string }) {
  const [lista, setLista] = useState<Comentario[] | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    const s = await getDocs(query(collection(db, "posts", postId, "comentarios"), orderBy("creadoEn", "desc"), limit(50)));
    setLista(s.docs.map((d) => ({ id: d.id, username: d.get("username"), texto: d.get("texto") })));
  }, [postId]);
  useEffect(() => { cargar().catch(() => setLista([])); }, [cargar]);

  async function enviar() {
    const v = texto.trim();
    if (!v) return setError("Escribe algo antes de enviar.");
    setEnviando(true);
    try {
      await api.comentar({ postId, texto: v });
      setTexto("");
      setError(null);
      await cargar();
    } catch (e) {
      setError(errorDe(e).mensaje);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <TituloHoja>Comentarios</TituloHoja>
      <p className="sub" style={{ margin: "0 0 10px" }}>Solo los ve quien desbloqueó esta foto.</p>
      <div>
        {lista === null ? <p className="sub">Cargando…</p> : lista.length ? lista.map((c) => (
          <div className="lrow" key={c.id}>
            <Avatar url={null} tam={34} />
            <div><b style={{ fontSize: 13 }}>@{c.username}</b><p style={{ fontSize: 14 }}>{c.texto}</p></div>
          </div>
        )) : <p style={{ color: "var(--muted)", fontSize: 14, padding: "14px 0" }}>Aún no hay comentarios. Sé el primero.</p>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <div className="field" style={{ flex: 1 }}><input maxLength={140} placeholder="Escribe un comentario" aria-label="Comentario" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviar()} /></div>
        <button className="iconbtn" style={{ background: "var(--fg)", color: "var(--bg)", width: 48, height: 48 }} aria-label="Enviar" onClick={enviar} disabled={enviando}><Ic n="arrow" /></button>
      </div>
      {error && <p style={{ fontSize: 12, color: "var(--rojo)", marginTop: 6 }}>{error}</p>}
    </>
  );
}

const MOTIVOS: [string, string][] = [
  ["inapropiado", "Contenido inapropiado"],
  ["menor", "Parece una persona menor de edad"],
  ["robada", "Foto robada o sin permiso"],
  ["respuesta", "La respuesta es incorrecta"],
  ["otro", "Otro motivo"],
];

function HojaReporte({ postId }: { postId: string }) {
  const { cerrarHoja, aviso } = useNav();
  const [sel, setSel] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function enviar() {
    if (!sel || enviando) return;
    setEnviando(true);
    try {
      await api.reportar({ postId, motivo: sel });
      cerrarHoja();
      aviso("Reporte enviado. Gracias.");
    } catch (e) {
      aviso(errorDe(e).mensaje);
      setEnviando(false);
    }
  }
  return (
    <>
      <TituloHoja>Reportar esta foto</TituloHoja>
      <p className="sub" style={{ marginBottom: 10 }}>Tu reporte es anónimo. Revisamos cada caso.</p>
      <div role="radiogroup">
        {MOTIVOS.map(([k, t]) => (
          <button key={k} className="item" role="radio" aria-checked={sel === k} style={{ padding: "12px 4px" }} onClick={() => setSel(k)}>
            <span className="t"><b>{t}</b></span>
            <span style={{ width: 22, height: 22, borderRadius: "50%", flex: "none", border: sel === k ? "7px solid var(--rosa)" : "2px solid var(--line)" }} />
          </button>
        ))}
      </div>
      <button className={`btn ${sel ? "danger" : "off"}`} style={{ marginTop: 12 }} onClick={enviar}>{enviando ? "Enviando…" : "Enviar reporte"}</button>
    </>
  );
}
