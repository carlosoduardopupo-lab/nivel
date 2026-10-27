import { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, orderBy, query, where, type Timestamp } from "firebase/firestore";
import { api, errorDe, type Pregunta } from "../api";
import { Barra, Cargando, Corazones, HiloComentarios, HojaCompartir, HojaVidas, ImagenStorage, PantallaCompleta, PildoraMonedas, TituloHoja, Avatar, HojaReporte, HojaOpcionesUsuario, HojaBloquear } from "../componentes";
import { auth, db } from "../firebase";
import { Ic } from "../iconos";
import { useNav } from "../nav";
import { useSesion, vidasAhora } from "../sesion";
import { diaDe, fmtFalta, monedasTxt, nf } from "../util";

// Preguntas por foto (functions/src/reglas.ts).
const PREGUNTAS_POR_POST = 1;

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
  const { bloqueados, privado } = useSesion();
  const { ir, abrirHoja, aviso } = useNav();
  const uid = auth.currentUser!.uid;
  const [creador, setCreador] = useState<{ username: string; avatarUrl: string | null; seguidores: number } | null>(null);
  const [sigo, setSigo] = useState<boolean | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [desb, setDesb] = useState<Set<string>>(new Set());
  const [intentos, setIntentos] = useState<Record<string, Intento>>({});
  const [idx, setIdx] = useState<number | null>(null);
  const [activa, setActiva] = useState<{ postId: string; p: Pregunta } | null>(null);
  const [restante, setRestante] = useState(1);
  const [ocupado, setOcupado] = useState(false);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [ahora, setAhora] = useState(Date.now());
  const enviado = useRef(false);

  const recargar = useCallback(async () => {
    const [u, ps, ds, is] = await Promise.all([
      getDoc(doc(db, "users", id)),
      getDocs(query(collection(db, "posts"), where("creadorId", "==", id), where("estado", "==", "aprobada"), where("oculta", "==", false), orderBy("orden"))),
      getDocs(query(collection(db, "users", uid, "desbloqueos"), where("creadorId", "==", id))),
      getDocs(query(collection(db, "users", uid, "intentos"), where("creadorId", "==", id))),
    ]);
    setCreador(u.exists() ? { username: u.get("username"), avatarUrl: u.get("avatarUrl"), seguidores: u.get("seguidores") ?? 0 } : null);
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

  // Al llegar a la foto que toca jugar, la pregunta se abre directamente (una vez por foto).
  const autoIniciadas = useRef(new Set<string>());
  useEffect(() => {
    if (!post || id === uid || activa || ocupado || desb.has(post.id) || idx !== siguiente || vidas <= 0) return;
    const it = intentos[post.id];
    const abiertaAun = !!it?.pendiente && !!it.inicioEn && it.inicioEn.toMillis() + post.tiempo * 1000 + MARGEN > Date.now();
    if (!abiertaAun && ((it?.preguntasUsadas ?? 0) >= PREGUNTAS_POR_POST || it?.ultimoDia === diaDe(new Date()))) return;
    if (autoIniciadas.current.has(post.id)) return;
    autoIniciadas.current.add(post.id);
    empezar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, activa, ocupado, desb, idx, siguiente, vidas, intentos]);

  useEffect(() => {
    getDoc(doc(db, "users", uid, "siguiendo", id)).then((s) => setSigo(s.exists()), () => setSigo(false));
  }, [uid, id]);

  async function alternarSeguir() {
    if (sigo === null) return;
    const v = !sigo;
    setSigo(v);
    setCreador((c) => c && { ...c, seguidores: c.seguidores + (v ? 1 : -1) });
    try {
      await (v ? api.seguir({ creadorId: id }) : api.dejarDeSeguir({ creadorId: id }));
    } catch (e) {
      setSigo(!v);
      setCreador((c) => c && { ...c, seguidores: c.seguidores + (v ? -1 : 1) });
      aviso(errorDe(e).mensaje);
    }
  }

  async function empezar() {
    if (!post || ocupado) return;
    setOcupado(true);
    try {
      const p = await api.empezarPregunta({ postId: post.id });
      enviado.current = false;
      setActiva({ postId: post.id, p });
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
      await api.pagarRespuesta({ postId: post.id });
      setActiva(null);
      await recargar();
    } catch (e) {
      aviso(errorDe(e).mensaje);
    } finally {
      setOcupado(false);
    }
  }

  if (!posts || idx === null) return <><Barra titulo="" /><Cargando /></>;
  if (!creador) return <><Barra titulo="" /><p className="sub" style={{ textAlign: "center", padding: 40 }}>Este creador no existe.</p></>;
  if (bloqueados.has(id)) return (
    <>
      <Barra titulo={"@" + creador.username} />
      <div style={{ textAlign: "center", padding: "50px 20px" }}>
        <span style={{ fontSize: 34, color: "var(--muted)" }}><Ic n="ban" /></span>
        <p className="h2" style={{ fontSize: 20, marginTop: 10 }}>Bloqueaste a @{creador.username}</p>
        <p className="sub">No ves sus fotos, reels ni comentarios.</p>
        <button className="btn soft" style={{ marginTop: 16 }} onClick={() => abrirHoja(<HojaBloquear uid={id} username={creador.username} />)}>Desbloquear</button>
      </div>
    </>
  );
  if (id === uid) return <><Barra titulo={"@" + creador.username} /><p className="sub" style={{ textAlign: "center", padding: 40 }}>Estas son tus fotos. Míralas en tu perfil.</p></>;
  if (!post) return <><Barra titulo={"@" + creador.username} /><p className="sub" style={{ textAlign: "center", padding: 40 }}>Aún no tiene fotos publicadas.</p></>;

  const intento = intentos[post.id];
  const hoy = diaDe(new Date(ahora));
  const pendienteAbierta = !!intento?.pendiente && !!intento.inicioEn && intento.inicioEn.toMillis() + post.tiempo * 1000 + MARGEN > ahora;
  const usadas = intento?.preguntasUsadas ?? 0;
  const falloHoy = !pendienteAbierta && intento?.ultimoDia === hoy;
  const sinPreguntas = !pendienteAbierta && usadas >= PREGUNTAS_POR_POST;
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
  } else if (sinPreguntas) {
    const fallada = intento?.resultado === "tiempo" ? "Se acabó el tiempo" : intento?.resultado === "fallo" ? "Respuesta incorrecta" : "Ya usaste tu intento";
    centro = <><p style={{ textAlign: "center", fontWeight: 700, fontSize: 16, color: "#FFB1AE" }}><Ic n="x" /> {fallada}</p></>;
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
        <button className="btn grad" style={{ marginTop: 12, height: 44 }} onClick={() => abrirHoja(<HojaVidas />)}><Ic n="share" /> Invita a un amigo y recupera 3 vidas</button>
        <button className="btn soft" style={{ marginTop: 8, height: 44, background: "rgba(255,255,255,.14)", color: "#fff" }} onClick={() => ir({ n: "tienda" })}>Conseguir monedas</button>
      </>
    );
  } else {
    centro = (
      <>
        {/* La pregunta empieza sola; el botón solo queda si no pudo arrancar (p. ej. sin conexión). */}
        <button className="opt" onClick={empezar} disabled={ocupado}>{ocupado ? "Cargando pregunta…" : "Responder"}</button>
      </>
    );
  }

  return (
    <>
      <Barra titulo={"@" + creador.username} derecha={<><Corazones vidas={vidas} /> <PildoraMonedas /></>} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Avatar url={creador.avatarUrl} tam={36} ampliable />
        <span style={{ flex: 1, fontSize: 13, color: "var(--muted)" }}>{nf(creador.seguidores)} {creador.seguidores === 1 ? "seguidor" : "seguidores"}</span>
        <button className="iconbtn" aria-label={`Reels de @${creador.username}`} onClick={() => ir({ n: "reels", autorId: id })}><Ic n="film" /></button>
        <button className="iconbtn" aria-label="Compartir" onClick={() => abrirHoja(<HojaCompartir username={creador.username} propio={false} />)}><Ic n="share" /></button>
        <button className="iconbtn" aria-label={`Opciones de @${creador.username}`} onClick={() => abrirHoja(<HojaOpcionesUsuario uid={id} username={creador.username} />)}><Ic n="dots" /></button>
        <button className={`follow ${sigo ? "on" : ""}`} onClick={alternarSeguir} disabled={sigo === null}>{sigo ? "Siguiendo" : "Seguir"}</button>
      </div>
      <div className="reel">
        {posts.map((p, i) => {
          const ok = desb.has(p.id);
          const bloqueada = !ok && i !== siguiente;
          return (
            <button key={p.id} className={`thumb ${i === idx ? "cur" : ""}`} aria-label={`Foto ${i + 1}${ok ? "" : " bloqueada"}`} disabled={bloqueada || !!activa}
              style={bloqueada ? { cursor: "default" } : undefined} onClick={() => setIdx(i)}>
              <div style={{ width: "100%", height: "100%" }}><ImagenStorage ruta={ok ? (p.tipo === "video" ? p.rutaBorrosa : p.rutaOriginal) : p.rutaBorrosa} /></div>
              {!ok && <span className="lk"><Ic n="lock" /></span>}
            </button>
          );
        })}
      </div>

      <div className="stage">
        <button className="dots" aria-label="Reportar esta foto" onClick={() => abrirHoja(<HojaReporte tipo="foto" id={post.id} />)}><Ic n="dots" /></button>
        {abierta ? (
          <>
            {/* Las fotos desbloqueadas se amplían tocándolas (los videos ya traen su botón de pantalla completa). */}
            <div className="art" onClick={post.tipo === "foto" && post.rutaOriginal ? () => setAmpliada(post.rutaOriginal) : undefined} style={post.tipo === "foto" ? { cursor: "zoom-in" } : undefined}>
              <ImagenStorage ruta={post.rutaOriginal} video={post.tipo === "video"} controles={post.tipo === "video"} />
            </div>
            <Lateral post={post} onComentarios={() => abrirHoja(<HojaComentarios postId={post.id} />)}
              siguiente={idx + 1 < posts.length && (desb.has(posts[idx + 1].id) || idx + 1 === siguiente) ? () => setIdx(idx + 1) : undefined} />
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

      {ampliada && (() => {
        // Todas las fotos desbloqueadas de este creador, en orden.
        const rutas = posts.filter((p) => desb.has(p.id) && p.tipo === "foto" && p.rutaOriginal).map((p) => p.rutaOriginal);
        return <PantallaCompleta rutas={rutas} inicio={rutas.indexOf(ampliada)} alCerrar={() => setAmpliada(null)} />;
      })()}
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

function HojaComentarios({ postId }: { postId: string }) {
  return (
    <>
      <TituloHoja>Comentarios</TituloHoja>
      <p className="sub" style={{ margin: "0 0 10px" }}>Solo los ve quien desbloqueó esta foto.</p>
      <HiloComentarios postId={postId} />
    </>
  );
}

