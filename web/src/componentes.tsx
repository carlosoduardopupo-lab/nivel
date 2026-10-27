import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from "firebase/firestore";
import { api, errorDe } from "./api";
import { art } from "./arte";
import { auth, db } from "./firebase";
import { Ic } from "./iconos";
import { useNav } from "./nav";
import { useSesion, vidasAhora } from "./sesion";
import { fmtFalta, nf, REF_AMIGOS, REF_MONEDAS, urlDeRuta } from "./util";

export function Corazones({ vidas }: { vidas?: number }) {
  const { privado } = useSesion();
  const { abrirHoja } = useNav();
  const v = vidas ?? vidasAhora(privado);
  return (
    <button className="hearts" aria-label={`${v} vidas. Ver cómo recuperarlas`} onClick={() => abrirHoja(<HojaVidas />)}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < v ? "" : "off"}><Ic n="heart" lleno /></span>
      ))}
    </button>
  );
}

export function PildoraMonedas() {
  const { privado } = useSesion();
  const { ir } = useNav();
  const m = privado?.monedas ?? 0;
  return (
    <button className="pill" onClick={() => ir({ n: "tienda" })} aria-label={`Monedas: ${m}. Abrir tienda`}>
      <span style={{ color: "var(--naranja)" }}><Ic n="coin" /></span>{nf(m)}
    </button>
  );
}

export function Barra({ titulo, derecha, icono = "back" }: { titulo: string; derecha?: ReactNode; icono?: string }) {
  const { volver } = useNav();
  return (
    <div className="top">
      <button className="iconbtn" onClick={volver} aria-label="Volver"><Ic n={icono} /></button>
      <h1>{titulo}</h1>
      <div style={{ minWidth: 38, display: "flex", justifyContent: "flex-end", gap: 6, alignItems: "center" }}>{derecha}</div>
    </div>
  );
}

/** Ilustración del prototipo como relleno (cuando no hay foto). */
export function Arte({ tema = "chica", fondo = "#F2ECEF" }: { tema?: string; fondo?: string }) {
  return <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: art(tema, fondo) }} />;
}

export function Avatar({ url, tam, borde, ampliable = false }: { url: string | null | undefined; tam: number; borde?: string; ampliable?: boolean }) {
  const [grande, setGrande] = useState(false);
  const puede = ampliable && !!url;
  return (
    <>
      <div className="ava" style={{ width: tam, height: tam, border: borde, background: "var(--surface2)", cursor: puede ? "zoom-in" : undefined }}
        {...(puede ? { role: "button", tabIndex: 0, "aria-label": "Ver foto de perfil", onClick: () => setGrande(true), onKeyDown: (e: React.KeyboardEvent) => e.key === "Enter" && setGrande(true) } : {})}>
        {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <Arte fondo="#FAC775" />}
      </div>
      {grande && url && <VisorFoto url={url} cerrar={() => setGrande(false)} />}
    </>
  );
}

/** Foto a pantalla completa sobre todo; se cierra tocando, con la X o con Escape. */
function VisorFoto({ url, cerrar }: { url: string; cerrar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    addEventListener("keydown", tecla);
    return () => removeEventListener("keydown", tecla);
  }, [cerrar]);
  return createPortal(
    <div role="dialog" aria-label="Foto de perfil" onClick={cerrar}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.94)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pop .2s ease" }}>
      <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
      <button className="iconbtn" aria-label="Cerrar" onClick={cerrar}
        style={{ position: "absolute", top: "calc(env(safe-area-inset-top) + 12px)", right: 12, color: "#fff", background: "rgba(255,255,255,.14)", borderRadius: "50%" }}><Ic n="x" /></button>
    </div>,
    document.body,
  );
}

/** Imagen guardada en Storage (respeta las reglas: la original solo si está desbloqueada). */
export function ImagenStorage({ ruta, video = false, controles = false, contener = false }: { ruta: string | null | undefined; video?: boolean; controles?: boolean; contener?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  useEffect(() => {
    let vivo = true;
    setUrl(null);
    setFallo(false);
    if (ruta) urlDeRuta(ruta).then((u) => vivo && setUrl(u), () => vivo && setFallo(true));
    return () => { vivo = false; };
  }, [ruta]);
  const estilo = { width: "100%", height: "100%", objectFit: contener ? ("contain" as const) : ("cover" as const), display: "block" };
  if (!ruta || fallo) return <div style={{ ...estilo, background: "var(--surface2)" }} />;
  if (!url) return <div style={{ ...estilo, background: "var(--surface2)" }} aria-busy="true" />;
  if (video) return <video src={url} style={estilo} controls={controles} playsInline loop autoPlay={!controles} muted={!controles} />;
  return <img src={url} alt="" style={estilo} />;
}

export function Cargando() {
  return <p className="sub" style={{ textAlign: "center", padding: "60px 0" }}>Cargando…</p>;
}

export function TituloHoja({ children }: { children: ReactNode }) {
  return <p style={{ fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 18, marginBottom: 6 }}>{children}</p>;
}

/**
 * Fotos a pantalla completa. Con varias, se pasa de una a otra deslizando,
 * con las flechas de la pantalla o con las del teclado. Se cierra tocando la
 * foto, con la ✕ o con Escape.
 */
export function PantallaCompleta({ rutas, inicio = 0, alCerrar }: { rutas: string[]; inicio?: number; alCerrar: () => void }) {
  const [i, setI] = useState(Math.min(Math.max(inicio, 0), rutas.length - 1));
  const toque = useRef<{ x: number; y: number } | null>(null);
  const deslizado = useRef(false);
  const ir = useCallback((d: number) => setI((n) => Math.min(rutas.length - 1, Math.max(0, n + d))), [rutas.length]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") alCerrar();
      if (e.key === "ArrowRight") ir(1);
      if (e.key === "ArrowLeft") ir(-1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [alCerrar, ir]);
  const flecha = (d: number, icono: string, lado: "left" | "right") => (
    <button className="iconbtn" aria-label={d > 0 ? "Siguiente foto" : "Foto anterior"} onClick={(e) => { e.stopPropagation(); ir(d); }}
      style={{ position: "absolute", top: "50%", [lado]: 10, transform: "translateY(-50%)", background: "rgba(255,255,255,.14)", color: "#fff", borderRadius: "50%" }}>
      <Ic n={icono} />
    </button>
  );
  return (
    <div role="dialog" aria-label="Foto a pantalla completa" style={{ position: "fixed", inset: 0, zIndex: 50, background: "#000", cursor: "zoom-out", touchAction: "pan-y" }}
      onPointerDown={(e) => { toque.current = { x: e.clientX, y: e.clientY }; deslizado.current = false; }}
      onPointerUp={(e) => {
        const t = toque.current;
        toque.current = null;
        if (!t) return;
        const dx = e.clientX - t.x;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - t.y)) { deslizado.current = true; ir(dx < 0 ? 1 : -1); }
      }}
      onClick={() => { if (!deslizado.current) alCerrar(); }}>
      <ImagenStorage ruta={rutas[i]} contener />
      {i > 0 && flecha(-1, "back", "left")}
      {i < rutas.length - 1 && flecha(1, "next", "right")}
      {rutas.length > 1 && <span style={{ position: "absolute", left: "50%", bottom: "calc(16px + env(safe-area-inset-bottom,0px))", transform: "translateX(-50%)", color: "#fff", fontSize: 13, fontWeight: 600, background: "rgba(255,255,255,.14)", padding: "4px 10px", borderRadius: 999 }}>{i + 1} / {rutas.length}</span>}
      <button className="iconbtn" aria-label="Cerrar" onClick={(e) => { e.stopPropagation(); alCerrar(); }} style={{ position: "absolute", top: "calc(12px + env(safe-area-inset-top,0px))", right: 12, background: "rgba(255,255,255,.14)", color: "#fff", borderRadius: "50%" }}><Ic n="x" /></button>
    </div>
  );
}

/** Abre el menú del sistema para compartir; si no existe (ordenador), copia el enlace. */
async function compartir(datos: { title: string; text: string; url: string }, aviso: (t: string) => void) {
  api.evento({ tipo: "compartir" }).catch(() => {});
  if (navigator.share) {
    await navigator.share(datos).catch(() => {});
    return;
  }
  try {
    await navigator.clipboard.writeText(`${datos.text} ${datos.url}`);
    aviso("Enlace copiado");
  } catch {
    aviso(datos.url);
  }
}

/** Hoja para compartir un perfil (abre directamente ese usuario) o la app. */
export function HojaCompartir({ username, propio }: { username: string; propio: boolean }) {
  const { aviso, cerrarHoja, abrirHoja } = useNav();
  const { perfil } = useSesion();
  const base = location.origin;
  // Todos los enlaces llevan mi código: si alguien se registra con él, gano vidas (y monedas al tercero).
  const ref = perfil ? `ref=${encodeURIComponent(perfil.username)}` : "";
  const opcion = (icono: string, titulo: string, sub: string, datos: { title: string; text: string; url: string }) => (
    <button className="lrow" style={{ width: "100%", textAlign: "left" }} onClick={() => { cerrarHoja(); compartir(datos, aviso); }}>
      <span style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flex: "none" }}><Ic n={icono} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 700, fontSize: 14 }}>{titulo}</p>
        <p style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</p>
      </div>
    </button>
  );
  return (
    <>
      <TituloHoja>Compartir</TituloHoja>
      {opcion("share", propio ? "Compartir mi perfil" : `Compartir a @${username}`, "Abre su perfil directamente en Blurry", {
        title: `@${username} en Blurry`,
        text: propio ? `Adivina y desbloquea mis fotos en Blurry: @${username}` : `Mira a @${username} en Blurry: adivina y desbloquea sus fotos.`,
        url: `${base}/?u=${encodeURIComponent(username)}${ref ? "&" + ref : ""}`,
      })}
      {opcion("eye", "Compartir Blurry", "Invita a alguien a la app", {
        title: "Blurry",
        text: "¿Qué hay detrás de lo borroso? Adivina y lo sabrás. Descarga Blurry y llévate 100 monedas de bienvenida.",
        url: `${base}/${ref ? "?" + ref : ""}`,
      })}
      <div style={{ marginTop: 12, background: "var(--surface2)", borderRadius: 14, padding: 12 }}>
        <PremioReferidos />
        <CodigoInvitacion />
      </div>
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
        Son monedas de regalo: no se canjean por dinero.{" "}
        <button style={{ fontWeight: 700, color: "var(--rosa)" }} onClick={() => abrirHoja(<HojaReglasReferidos />)}>Ver reglas</button>
      </p>
    </>
  );
}

type Comentario = { id: string; autorId: string; username: string; texto: string; fecha: string; respondeA?: string; respondeAUsername?: string };

/**
 * Comentarios de una foto con respuestas (un nivel: las respuestas van debajo
 * del comentario principal). Tocar un nombre abre su perfil.
 */
export function HiloComentarios({ postId, coleccion = "posts", alCambiar }: { postId: string; coleccion?: "posts" | "reels"; alCambiar?: (total: number) => void }) {
  const { ir, cerrarHoja } = useNav();
  const [lista, setLista] = useState<Comentario[] | null>(null);
  const [avatares, setAvatares] = useState<Record<string, string | null>>({});
  const [texto, setTexto] = useState("");
  const [respondiendo, setRespondiendo] = useState<Comentario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const s = await getDocs(query(collection(db, coleccion, postId, "comentarios"), orderBy("creadoEn", "asc"), limit(200)));
    const l = s.docs.map((d) => ({
      id: d.id, autorId: d.get("autorId"), username: d.get("username"), texto: d.get("texto"),
      fecha: d.get("creadoEn")?.toDate().toLocaleString("es", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) ?? "", respondeA: d.get("respondeA"), respondeAUsername: d.get("respondeAUsername"),
    }));
    setLista(l);
    alCambiar?.(l.length);
    const faltan = [...new Set(l.map((c) => c.autorId))];
    const us = await Promise.all(faltan.map((id) => getDoc(doc(db, "users", id)).then((u) => [id, u.get("avatarUrl") ?? null] as const, () => [id, null] as const)));
    setAvatares(Object.fromEntries(us));
  }, [postId, coleccion, alCambiar]);
  useEffect(() => { cargar().catch(() => setLista([])); }, [cargar]);

  async function enviar() {
    const v = texto.trim();
    if (!v) return setError("Escribe algo antes de enviar.");
    setEnviando(true);
    try {
      if (coleccion === "reels") await api.comentarReel({ reelId: postId, texto: v, respondeA: respondiendo?.id });
      else await api.comentar({ postId, texto: v, respondeA: respondiendo?.id });
      setTexto("");
      setRespondiendo(null);
      setError(null);
      await cargar();
    } catch (e) {
      setError(errorDe(e).mensaje);
    } finally {
      setEnviando(false);
    }
  }

  const abrirPerfil = (id: string) => { cerrarHoja(); ir(id === auth.currentUser?.uid ? { n: "perfil" } : { n: "creador", id }); };
  const fila = (c: Comentario, respuesta: boolean) => (
    <div key={c.id} style={{ display: "flex", gap: 10, padding: "8px 0", marginLeft: respuesta ? 44 : 0 }}>
      <button onClick={() => abrirPerfil(c.autorId)} aria-label={`Perfil de @${c.username}`} style={{ borderRadius: "50%", flex: "none" }}><Avatar url={avatares[c.autorId]} tam={respuesta ? 28 : 34} /></button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13 }}>
          <button style={{ fontWeight: 700 }} onClick={() => abrirPerfil(c.autorId)}>@{c.username}</button>{" "}
          <span style={{ color: "var(--muted)", fontSize: 11 }}>{c.fecha}</span>
        </p>
        <p style={{ fontSize: 14, marginTop: 2, overflowWrap: "anywhere" }}>
          {respuesta && c.respondeAUsername && <span style={{ color: "var(--rosa)", fontWeight: 600 }}>@{c.respondeAUsername} </span>}{c.texto}
        </p>
        <button style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginTop: 4 }} onClick={() => { setRespondiendo(c); entrada.current?.focus(); }}>Responder</button>
      </div>
    </div>
  );

  // Principales: el más nuevo arriba. Respuestas: en orden, debajo de su principal.
  const { bloqueados } = useSesion();
  const visibles = (lista ?? []).filter((c) => !bloqueados.has(c.autorId));
  const principales = visibles.filter((c) => !c.respondeA).reverse();
  const respuestas = (id: string) => visibles.filter((c) => c.respondeA === id);
  return (
    <>
      <div>
        {lista === null ? <p className="sub">Cargando…</p> : principales.length ? principales.map((c) => (
          <div key={c.id}>{fila(c, false)}{respuestas(c.id).map((r) => fila(r, true))}</div>
        )) : <p style={{ color: "var(--muted)", fontSize: 14, padding: "14px 0" }}>Aún no hay comentarios. Sé el primero.</p>}
      </div>
      {respondiendo && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
          <span style={{ flex: 1 }}>Respondiendo a <b style={{ color: "var(--fg)" }}>@{respondiendo.username}</b></span>
          <button aria-label="Cancelar respuesta" onClick={() => setRespondiendo(null)}><Ic n="x" /></button>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: respondiendo ? 6 : 10 }}>
        <div className="field" style={{ flex: 1 }}><input ref={entrada} maxLength={140} placeholder={respondiendo ? `Responde a @${respondiendo.username}` : "Escribe un comentario"} aria-label="Comentario" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviar()} /></div>
        <button className="iconbtn" style={{ background: "var(--fg)", color: "var(--bg)", width: 48, height: 48 }} aria-label="Enviar" onClick={enviar} disabled={enviando}><Ic n="arrow" /></button>
      </div>
      {error && <p style={{ fontSize: 12, color: "var(--rojo)", marginTop: 6 }}>{error}</p>}
    </>
  );
}

const REGLAS_REFERIDOS: [string, string][] = [
  ["Tu código de invitación", "Es tu nombre de usuario. Va dentro de cualquier enlace que compartas desde Blurry, y tu amigo también puede escribirlo al registrarse."],
  ["Cuándo cuenta un amigo", "Cuando crea una cuenta nueva con tu código y juega su primera foto (acertando, fallando o pagando). Solo registrarse no cuenta."],
  ["1 amigo = 3 vidas", "Cada amigo que cuenta te recarga las 3 vidas al momento, aunque estuvieras esperando las 24 horas. Máximo una recarga al día."],
  [`${REF_AMIGOS} amigos = ${REF_MONEDAS} monedas`, `Cuando cuenta tu tercer amigo ganas ${REF_MONEDAS} monedas, una sola vez. A partir del cuarto, los amigos siguen recargando tus vidas (una vez al día).`],
  ["Monedas de regalo, no canjeables", "Sirven para desbloquear fotos y se gastan antes que las compradas. No se convierten en dinero, no se pueden retirar ni pasar a otra persona, y el creador no cobra por ellas."],
  ["Solo cuentas nuevas", "Solo cuenta quien no tenía cuenta en Blurry y es mayor de 18 años. Tu propia cuenta no cuenta."],
  ["Tu amigo también gana", "Quien se registra recibe sus 100 monedas de bienvenida, como cualquier usuario nuevo."],
  ["Juego limpio", "Si se crean cuentas falsas o repetidas para conseguir premios, Blurry puede quitarlos y suspender las cuentas."],
  ["Cambios", "Blurry puede cambiar o terminar el programa de invitaciones. Lo que ya ganaste se conserva."],
];

/** Reglas del programa de invitaciones (referidos). */
export function HojaReglasReferidos() {
  return (
    <>
      <TituloHoja>Invita y gana · Reglas</TituloHoja>
      {REGLAS_REFERIDOS.map(([t, d], i) => (
        <div key={t} style={{ display: "flex", gap: 12, padding: "9px 0" }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--surface2)", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{i + 1}</span>
          <div><b style={{ fontSize: 14 }}>{t}</b><p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.45, marginTop: 2 }}>{d}</p></div>
        </div>
      ))}
    </>
  );
}

/** Progreso y premio de las invitaciones. */
function PremioReferidos() {
  const { privado } = useSesion();
  const n = privado?.referidos ?? 0;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ color: "var(--oro)", fontSize: 22 }}><Ic n="coin" /></span>
      <p style={{ fontSize: 13, lineHeight: 1.45 }}>
        <b>1 amigo = 3 vidas</b> (cuando juegue su primera foto; una recarga al día). {(privado?.monedasReferidos ?? 0) >= REF_MONEDAS
          ? <>Ya ganaste tus <b>{REF_MONEDAS} monedas</b> por invitar a {REF_AMIGOS} amigos. ¡Gracias!</>
          : <><b>{REF_AMIGOS} amigos = {REF_MONEDAS} monedas.</b> Llevas {Math.min(n, REF_AMIGOS)} de {REF_AMIGOS}.</>}
      </p>
    </div>
  );
}

/** Código de invitación (el nombre de usuario) con botón para copiarlo. */
export function CodigoInvitacion() {
  const { perfil } = useSesion();
  const { aviso } = useNav();
  if (!perfil) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, background: "var(--surface)", border: "1px dashed var(--line)", borderRadius: 12, padding: "8px 8px 8px 12px" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <small style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>Tu código de invitación</small>
        <b style={{ fontFamily: "var(--f-display)", fontSize: 18, letterSpacing: ".04em" }}>{perfil.username.toUpperCase()}</b>
      </span>
      <button className="chip" onClick={() => (navigator.clipboard ? navigator.clipboard.writeText(perfil.username) : Promise.reject()).then(() => aviso("Código copiado"), () => aviso(perfil.username))}>Copiar</button>
    </div>
  );
}

/** Tarjeta "Comparte y gana" (tienda y otros sitios). */
export function TarjetaInvitar() {
  const { perfil, privado } = useSesion();
  const { abrirHoja } = useNav();
  if (!perfil) return null;
  const listo = (privado?.monedasReferidos ?? 0) >= REF_MONEDAS;
  const n = Math.min(privado?.referidos ?? 0, REF_AMIGOS);
  return (
    <div style={{ marginTop: 16, borderRadius: 18, padding: 14, background: "var(--surface2)", border: "1px solid var(--line)" }}>
      <button style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left" }} onClick={() => abrirHoja(<HojaCompartir username={perfil.username} propio />)}>
        <span style={{ width: 46, height: 46, borderRadius: 14, background: "var(--grad)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flex: "none" }}><Ic n="share" /></span>
        <span style={{ flex: 1 }}>
          <b style={{ display: "block", fontSize: 15 }}>Comparte Blurry con {REF_AMIGOS} amigos y gana {REF_MONEDAS} monedas</b>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{listo ? "Ya ganaste tus monedas. Cada amigo que juega te sigue dando 3 vidas." : `Cada amigo que juega te da 3 vidas · llevas ${n} de ${REF_AMIGOS}`}</span>
        </span>
        <span style={{ color: "var(--muted)" }}><Ic n="next" /></span>
      </button>
      <button style={{ fontSize: 12, fontWeight: 700, color: "var(--rosa)", marginTop: 10 }} onClick={() => abrirHoja(<HojaReglasReferidos />)}>Reglas de referidos</button>
    </div>
  );
}

/** Vidas: cuántas quedan, cuándo vuelven y cómo recuperarlas invitando a un amigo. */
export function HojaVidas() {
  const { perfil, privado } = useSesion();
  const { ir, abrirHoja } = useNav();
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(t); }, []);
  const v = vidasAhora(privado, ahora);
  const vuelven = privado?.vidasVuelvenEn?.toMillis() ?? 0;
  return (
    <>
      <div style={{ textAlign: "center" }}>
        <span className="hearts" style={{ fontSize: 30, gap: 8, justifyContent: "center" }}>{[0, 1, 2].map((i) => <span key={i} className={i < v ? "" : "off"}><Ic n="heart" lleno /></span>)}</span>
        <p className="h2" style={{ fontSize: 22, marginTop: 10 }}>{v === 0 ? "Te quedaste sin vidas" : `Tienes ${v} ${v === 1 ? "vida" : "vidas"}`}</p>
        <p className="sub">{v === 0 && vuelven > ahora ? <>Vuelven en <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmtFalta(vuelven - ahora)}</b></> : "Cada fallo gasta una. Mañana vuelven a ser 3."}</p>
      </div>
      <div style={{ marginTop: 16, background: "var(--surface2)", borderRadius: 16, padding: 14 }}>
        <b style={{ fontSize: 15 }}>Recupera tus 3 vidas ahora</b>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, lineHeight: 1.45 }}>Invita a un amigo: cuando se registre con tu código y juegue su primera foto, tus vidas vuelven a 3 (una recarga al día).</p>
        <CodigoInvitacion />
        {perfil && <button className="btn grad" style={{ marginTop: 12 }} onClick={() => abrirHoja(<HojaCompartir username={perfil.username} propio />)}><Ic n="share" /> Invitar a un amigo</button>}
      </div>
      <button className="btn soft" style={{ marginTop: 10 }} onClick={() => ir({ n: "tienda" })}><Ic n="coin" /> Seguir jugando con monedas</button>
      <p style={{ textAlign: "center", marginTop: 10 }}><button style={{ fontSize: 12, fontWeight: 700, color: "var(--rosa)" }} onClick={() => abrirHoja(<HojaReglasReferidos />)}>Reglas de referidos</button></p>
    </>
  );
}

// Dirección de la última vez que se cambió entre Juego y Reels (para la animación de entrada).
let direccionSeccion: "izq" | "der" | null = null;
export const claseEntrada = () => {
  const d = direccionSeccion;
  direccionSeccion = null;
  return d ? `entra-${d}` : "";
};

/**
 * Botones flotantes de abajo: "+" en el centro (crea publicación o reel) y,
 * a un lado, el acceso a la otra sección: la película (Reels) a la derecha en
 * el Juego, y el mando (Juego) a la izquierda en Reels.
 */
export function BotonesFlotantes({ seccion }: { seccion: "juego" | "reels" }) {
  const { ir, reiniciar } = useNav();
  const enJuego = seccion === "juego";
  return (
    <>
      {enJuego ? (
        <button className="fab-mini der" aria-label="Ver reels" onClick={() => { direccionSeccion = "der"; reiniciar({ n: "reels" }); }}><Ic n="film" /></button>
      ) : (
        <button className="fab-mini izq" aria-label="Jugar" onClick={() => { direccionSeccion = "izq"; reiniciar({ n: "feed" }); }}><Ic n="gamepad" /></button>
      )}
      <button className="fab" onClick={() => ir({ n: enJuego ? "crear" : "crearReel" })} aria-label={enJuego ? "Crear publicación" : "Crear reel"}><Ic n="plus" /></button>
    </>
  );
}

/** Aviso de la fase de prueba: las monedas no tienen valor real; los seguidores sí cuentan. */
export function AvisoFasePrueba({ oscuro = false }: { oscuro?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14, borderRadius: 14, padding: 12, fontSize: 12.5, lineHeight: 1.45,
      background: oscuro ? "rgba(255,255,255,.1)" : "var(--surface2)", color: oscuro ? "#fff" : "var(--fg)" }}>
      <span style={{ fontSize: 18, color: "var(--oro)", flex: "none" }}><Ic n="spark" /></span>
      <p>
        <b>Estamos en fase de prueba.</b> Las monedas que acumulas sirven para probar cómo funciona el sistema:
        no tienen valor real y todavía no se pueden comprar ni retirar. Te avisaremos cuando empiece a
        funcionar el sistema de pagos. <b>Los seguidores sí son reales</b> y cada uno impulsa el crecimiento de tu perfil.
      </p>
    </div>
  );
}

const MOTIVOS_REPORTE: [string, string, "foto" | "reel" | "ambos"][] = [
  ["inapropiado", "Contenido inapropiado", "ambos"],
  ["menor", "Parece una persona menor de edad", "ambos"],
  ["robada", "Robado o sin permiso", "ambos"],
  ["respuesta", "La respuesta es incorrecta", "foto"],
  ["otro", "Otro motivo", "ambos"],
];

/** Reportar una foto o un reel. Con 3 reportes se oculta hasta revisarlo. */
export function HojaReporte({ tipo, id }: { tipo: "foto" | "reel"; id: string }) {
  const { cerrarHoja, aviso } = useNav();
  const [sel, setSel] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function enviar() {
    if (!sel || enviando) return;
    setEnviando(true);
    try {
      if (tipo === "reel") await api.reportarReel({ reelId: id, motivo: sel });
      else await api.reportar({ postId: id, motivo: sel });
      cerrarHoja();
      aviso("Reporte enviado. Gracias.");
    } catch (e) {
      aviso(errorDe(e).mensaje);
      setEnviando(false);
    }
  }
  return (
    <>
      <TituloHoja>{tipo === "reel" ? "Reportar este reel" : "Reportar esta foto"}</TituloHoja>
      <p className="sub" style={{ marginBottom: 10 }}>Tu reporte es anónimo. Revisamos cada caso.</p>
      <div role="radiogroup">
        {MOTIVOS_REPORTE.filter(([, , t]) => t === "ambos" || t === tipo).map(([k, t]) => (
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

/** Bloquear o desbloquear a un usuario. Al bloquear, se deja de ver su contenido y se rompen los seguimientos. */
export function HojaBloquear({ uid, username, alCambiar }: { uid: string; username: string; alCambiar?: (bloqueado: boolean) => void }) {
  const { bloqueados } = useSesion();
  const { cerrarHoja, aviso } = useNav();
  const [ocupado, setOcupado] = useState(false);
  const bloqueado = bloqueados.has(uid);
  async function cambiar() {
    setOcupado(true);
    try {
      await api.bloquear({ otroId: uid, valor: !bloqueado });
      alCambiar?.(!bloqueado);
      cerrarHoja();
      aviso(bloqueado ? `Desbloqueaste a @${username}` : `Bloqueaste a @${username}`);
    } catch (e) {
      aviso(errorDe(e).mensaje);
      setOcupado(false);
    }
  }
  return (
    <>
      <TituloHoja>{bloqueado ? `¿Desbloquear a @${username}?` : `¿Bloquear a @${username}?`}</TituloHoja>
      <p className="sub" style={{ lineHeight: 1.5 }}>
        {bloqueado
          ? "Volverás a ver sus fotos, reels y comentarios. Podrá seguirte y comentar otra vez."
          : "No verás sus fotos, reels ni comentarios. Dejaréis de seguiros y no podrá seguirte ni comentar en tus fotos o reels. No se le avisa."}
      </p>
      <button className={`btn ${bloqueado ? "dark" : "danger"}`} style={{ marginTop: 16 }} disabled={ocupado} onClick={cambiar}>
        {ocupado ? "Un momento…" : bloqueado ? "Desbloquear" : "Bloquear"}
      </button>
      <button className="btn soft" style={{ marginTop: 8 }} onClick={cerrarHoja}>Cancelar</button>
    </>
  );
}

/** Menú de opciones sobre otro usuario o su contenido: reportar y bloquear. */
export function HojaOpcionesUsuario({ uid, username, reporte }: { uid: string; username: string; reporte?: { tipo: "foto" | "reel"; id: string } }) {
  const { abrirHoja } = useNav();
  const { bloqueados } = useSesion();
  return (
    <>
      <TituloHoja>@{username}</TituloHoja>
      {reporte && (
        <button className="item" style={{ padding: "12px 4px" }} onClick={() => abrirHoja(<HojaReporte tipo={reporte.tipo} id={reporte.id} />)}>
          <span style={{ color: "var(--rojo)" }}><Ic n="flag" /></span><span className="t"><b>{reporte.tipo === "reel" ? "Reportar este reel" : "Reportar esta foto"}</b></span>
        </button>
      )}
      <button className="item" style={{ padding: "12px 4px" }} onClick={() => abrirHoja(<HojaBloquear uid={uid} username={username} />)}>
        <span style={{ color: "var(--rojo)" }}><Ic n="ban" /></span><span className="t"><b>{bloqueados.has(uid) ? `Desbloquear a @${username}` : `Bloquear a @${username}`}</b></span>
      </button>
    </>
  );
}
