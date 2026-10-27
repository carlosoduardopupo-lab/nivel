import { useEffect, useState } from "react";
import { sendPasswordResetEmail, signOut } from "firebase/auth";
import { collection, doc, getDocs, orderBy, query, updateDoc, where, getDoc } from "firebase/firestore";
import { api, errorDe } from "../api";
import { Barra, HojaReglasReferidos, TituloHoja, Avatar, HojaBloquear } from "../componentes";
import { auth, db } from "../firebase";
import { Ic } from "../iconos";
import { useNav } from "../nav";
import { useSesion } from "../sesion";
import { INTERESES, nf, CORREO_SOPORTE } from "../util";

type Fila = { i: string; t: string; s?: string; sw?: string; accion?: () => void };

export function Ajustes() {
  const { perfil, privado, usuario, bloqueados } = useSesion();
  const { ir, abrirHoja, cerrarHoja, aviso } = useNav();
  // escaparate: activado salvo que el creador lo haya desactivado (las cuentas antiguas no lo tienen).
  const [sw, setSw] = useState<Record<string, boolean>>({ escaparate: true, ...privado?.ajustes });
  useEffect(() => { if (privado?.ajustes) setSw(privado.ajustes); }, [privado?.ajustes]);

  async function alternar(k: string) {
    const nuevo = { ...sw, [k]: !sw[k] };
    setSw(nuevo);
    try {
      await api.guardarAjustes({ ajustes: { [k]: nuevo[k] } });
    } catch (e) {
      setSw(sw);
      aviso(errorDe(e).mensaje);
    }
  }

  const pronto = (t: string) => () => aviso(`${t}: próximamente`);
  const grupos: [string, Fila[]][] = [
    ["Cuenta", [
      { i: "mail", t: "Correo", s: usuario?.email ?? "—" },
      { i: "key", t: "Contraseña", s: "Cambiar contraseña", accion: () => usuario?.email && sendPasswordResetEmail(auth, usuario.email).then(() => aviso("Te enviamos un correo para cambiarla"), () => aviso("No se pudo enviar el correo")) },
      { i: "shield", t: "Datos privados", s: "Nombre real y fecha de nacimiento", accion: () => abrirHoja(<><TituloHoja>Datos privados</TituloHoja><p className="sub">Nadie más los ve.</p><p className="lbl">Nombre real</p><p>{privado?.nombreReal}</p><p className="lbl">Fecha de nacimiento</p><p>{privado?.fechaNacimiento}</p></>) },
      { i: "check", t: "Verificación de identidad", s: perfil?.identidadVerificada ? "Verificada" : "Pendiente · se hace al conectar tu banco", accion: () => ir({ n: "retiro" }) },
      { i: "spark", t: "Mis intereses", s: perfil?.intereses?.join(", ") || "Ninguno", accion: () => abrirHoja(<HojaIntereses />) },
    ]],
    ["Notificaciones", [
      { i: "photo", t: "Fotos nuevas de mis seguidos", sw: "nuevas" },
      { i: "heart", t: "Vidas recuperadas", sw: "vidas" },
      { i: "coin", t: "Ganancias y retiros", sw: "ganancias" },
      { i: "msg", t: "Comentarios en mis fotos", sw: "comentarios" },
    ]],
    ["Privacidad", [
      { i: "msg", t: "Permitir comentarios", s: "Solo quien desbloqueó la foto", sw: "comentar" },
      { i: "spark", t: "Aparecer en \"Para ti\"", s: "Te sugerimos a otros jugadores", sw: "sugeridos" },
      { i: "eye", t: "Aparecer en la web de Blurry", s: "Si estás entre los populares, tu tarjeta (foto de perfil) sale en la página de descarga", sw: "escaparate" },
      { i: "ban", t: "Cuentas bloqueadas", s: bloqueados.size ? `${bloqueados.size}` : "Ninguna", accion: () => abrirHoja(<HojaBloqueados />) },
    ]],
    ["Pagos", [
      { i: "bank", t: "Cuenta bancaria", s: "Sin conectar", accion: () => ir({ n: "retiro" }) },
      { i: "receipt", t: "Historial de compras", accion: () => abrirHoja(<HojaCompras />) },
      { i: "file", t: "Documentos de impuestos", s: "Formulario W-9 y 1099", accion: pronto("Documentos de impuestos") },
    ]],
    ["Ayuda", [
      { i: "help", t: "Centro de ayuda", accion: () => abrirHoja(<HojaAyuda />) },
      { i: "flag", t: "Reportar un problema", accion: () => abrirHoja(<HojaProblema />) },
      { i: "book", t: "Reglas del juego", accion: () => abrirHoja(<HojaReglas />) },
      { i: "share", t: "Reglas de referidos", accion: () => abrirHoja(<HojaReglasReferidos />) },
      { i: "file", t: "Términos de uso", accion: () => window.open("/terminos/", "_blank", "noopener") },
      { i: "shield", t: "Política de privacidad", accion: () => window.open("/privacidad/", "_blank", "noopener") },
    ]],
  ];

  return (
    <>
      <Barra titulo="Ajustes" />
      {grupos.map(([g, filas]) => (
        <div key={g}>
          <p className="lbl">{g}</p>
          <div className="group">
            {filas.map((f) => f.sw ? (
              <button key={f.t} className="item" role="switch" aria-checked={!!sw[f.sw]} onClick={() => alternar(f.sw!)}>
                <span className="ib"><Ic n={f.i} /></span>
                <span className="t"><b>{f.t}</b>{f.s && <span>{f.s}</span>}</span>
                <span className={`sw ${sw[f.sw] ? "on" : ""}`} />
              </button>
            ) : (
              <button key={f.t} className="item" onClick={f.accion} disabled={!f.accion}>
                <span className="ib"><Ic n={f.i} /></span>
                <span className="t"><b>{f.t}</b>{f.s && <span style={f.t.startsWith("Verificación") && perfil?.identidadVerificada ? { color: "var(--verde)" } : undefined}>{f.s}</span>}</span>
                {f.accion && <span style={{ color: "var(--muted)" }}><Ic n="next" /></span>}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 6 }}>
        <button className="btn soft" onClick={() => abrirHoja(
          <>
            <p className="h2" style={{ fontSize: 20, textAlign: "center" }}>¿Cerrar sesión?</p>
            <p className="sub" style={{ textAlign: "center" }}>Tus monedas, vidas y colección se quedan guardadas.</p>
            <button className="btn dark" style={{ marginTop: 16 }} onClick={() => { cerrarHoja(); signOut(auth); }}>Cerrar sesión</button>
            <button className="btn" style={{ marginTop: 6, color: "var(--muted)" }} onClick={cerrarHoja}>Cancelar</button>
          </>,
        )}><Ic n="out" /> Cerrar sesión</button>
        <button style={{ textAlign: "center", fontWeight: 700, fontSize: 13, color: "var(--rojo)", padding: 12 }} onClick={() => abrirHoja(<HojaEliminarCuenta />)}>Eliminar cuenta</button>
      </div>
      <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted)" }}>Blurry · versión 0.3</p>
    </>
  );
}

function HojaIntereses() {
  const { perfil } = useSesion();
  const { cerrarHoja, aviso } = useNav();
  const [sel, setSel] = useState(new Set(perfil?.intereses ?? []));
  async function guardar() {
    if (sel.size < 3) return;
    try {
      await updateDoc(doc(db, "users", auth.currentUser!.uid), { intereses: [...sel] });
      cerrarHoja();
      aviso("Intereses guardados");
    } catch {
      aviso("No se pudieron guardar");
    }
  }
  return (
    <>
      <TituloHoja>Mis intereses</TituloHoja>
      <p className="sub" style={{ marginBottom: 14 }}>Elige al menos 3.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {INTERESES.map((t) => (
          <button key={t} className={`chip ${sel.has(t) ? "on" : ""}`} onClick={() => setSel((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else if (n.size < 10) n.add(t); return n; })}>{t}</button>
        ))}
      </div>
      <button className={`btn ${sel.size >= 3 ? "grad" : "off"}`} style={{ marginTop: 18 }} onClick={guardar}>Guardar</button>
    </>
  );
}

function HojaCompras() {
  const [lista, setLista] = useState<{ id: string; monedas: number; centavos: number; fecha: string }[] | null>(null);
  useEffect(() => {
    getDocs(query(collection(db, "compras"), where("uid", "==", auth.currentUser!.uid), orderBy("creadoEn", "desc"))).then(
      (s) => setLista(s.docs.map((d) => ({ id: d.id, monedas: d.get("monedas"), centavos: d.get("montoCentavos") ?? 0, fecha: d.get("creadoEn")?.toDate().toLocaleDateString("es") ?? "" }))),
      () => setLista([]),
    );
  }, []);
  return (
    <>
      <TituloHoja>Historial de compras</TituloHoja>
      {lista === null ? <p className="sub">Cargando…</p> : lista.length ? lista.map((c) => (
        <div className="lrow" key={c.id}>
          <span className="coin" style={{ width: 36, height: 36, fontSize: 18 }}><Ic n="coin" /></span>
          <div style={{ flex: 1 }}><b style={{ fontSize: 14 }}>{nf(c.monedas)} monedas</b><p style={{ fontSize: 12, color: "var(--muted)" }}>{c.fecha}</p></div>
          <b>${(c.centavos / 100).toFixed(2)}</b>
        </div>
      )) : <p className="sub">Aún no has comprado monedas.</p>}
    </>
  );
}

const REGLAS: [string, string][] = [
  ["Cada foto es un nivel", "Se juega en orden. Aciertas la trivia y la foto queda en tu colección para siempre."],
  ["3 vidas al día", "Cada fallo gasta una. Sin vidas, esperas 24 horas o sigues pagando con monedas."],
  ["Una pregunta por foto", "Tienes un intento. Si fallas, solo puedes verla pagando."],
  ["Tiempo según el precio", "10 segundos con 1 moneda y 5 más por cada moneda extra, hasta 30."],
  ["Ver respuesta", "El botón con el precio siempre está disponible: pagas y la foto es tuya."],
  ["Precios", "De 1 a 20 monedas por foto (videos desde 3). Los creadores VIP pueden cobrar hasta 100."],
  ["Creadores", "Reciben $0.005 por cada moneda gastada en sus publicaciones. Retiro mínimo de $50."],
];

export function HojaReglas() {
  return (
    <>
      <TituloHoja>Reglas del juego</TituloHoja>
      {REGLAS.map(([t, d]) => (
        <div key={t} style={{ padding: "9px 0" }}><b style={{ fontSize: 14 }}>{t}</b><p style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, lineHeight: 1.45 }}>{d}</p></div>
      ))}
    </>
  );
}

function HojaBloqueados() {
  const { bloqueados } = useSesion();
  const { abrirHoja } = useNav();
  const [lista, setLista] = useState<{ id: string; username: string; avatarUrl: string | null }[] | null>(null);
  useEffect(() => {
    Promise.all([...bloqueados].map((id) => getDoc(doc(db, "users", id)).then((u) => ({ id, username: u.get("username") ?? "usuario", avatarUrl: u.get("avatarUrl") ?? null }))))
      .then(setLista, () => setLista([]));
  }, [bloqueados]);
  return (
    <>
      <TituloHoja>Cuentas bloqueadas</TituloHoja>
      {lista === null ? <p className="sub">Cargando…</p> : !lista.length ? <p className="sub" style={{ padding: "14px 0" }}>No has bloqueado a nadie.</p> : lista.map((u) => (
        <div className="lrow" key={u.id}>
          <Avatar url={u.avatarUrl} tam={40} />
          <p style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>@{u.username}</p>
          <button className="follow on" onClick={() => abrirHoja(<HojaBloquear uid={u.id} username={u.username} />)}>Desbloquear</button>
        </div>
      ))}
    </>
  );
}

const PREGUNTAS_AYUDA: [string, string][] = [
  ["¿Cómo veo una foto borrosa?", "Toca la foto que toca jugar: aparece una pregunta sobre el creador con tres respuestas. Si aciertas antes de que acabe el tiempo, la foto es tuya. También puedes verla pagando con monedas."],
  ["Me quedé sin vidas", "Toca los corazones de arriba: puedes esperar a que vuelvan, invitar a un amigo (cuando juegue su primera foto, recuperas tus 3 vidas) o seguir con monedas."],
  ["¿Las monedas son dinero?", "No. Estamos en fase de prueba: las monedas sirven para probar el sistema y no se pueden comprar ni retirar todavía. Te avisaremos cuando empiecen los pagos."],
  ["¿Cómo publico?", "Toca + en el juego para subir una foto o video con tu pregunta, o + en Reels para subir un video gratis que invite a jugar."],
  ["Alguien me molesta", "Abre su perfil o su reel, toca ⋯ y elige Bloquear. Dejarás de ver su contenido y no podrá seguirte ni comentarte."],
  ["Vi algo que no debería estar", "Toca ⋯ en la foto o el reel y elige Reportar. Con 3 reportes se oculta hasta que lo revisemos."],
  ["Quiero eliminar mi cuenta", "Ajustes → Eliminar cuenta. Se borran tu perfil, tus datos y tus publicaciones (las fotos que otros ya desbloquearon siguen en su colección)."],
];

function HojaAyuda() {
  const { abrirHoja } = useNav();
  const [abierta, setAbierta] = useState<number | null>(null);
  return (
    <>
      <TituloHoja>Centro de ayuda</TituloHoja>
      {PREGUNTAS_AYUDA.map(([p, r], i) => (
        <div key={p} style={{ borderBottom: "1px solid var(--line)" }}>
          <button style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "12px 2px", textAlign: "left", fontWeight: 700, fontSize: 14 }} onClick={() => setAbierta(abierta === i ? null : i)} aria-expanded={abierta === i}>
            <span style={{ flex: 1 }}>{p}</span><span style={{ color: "var(--muted)", transform: abierta === i ? "rotate(90deg)" : "none", transition: "transform .2s" }}><Ic n="next" /></span>
          </button>
          {abierta === i && <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, padding: "0 2px 12px" }}>{r}</p>}
        </div>
      ))}
      <p className="sub" style={{ marginTop: 16 }}>¿No encuentras lo que buscas?</p>
      <button className="btn soft" style={{ marginTop: 8 }} onClick={() => abrirHoja(<HojaProblema />)}><Ic n="flag" /> Reportar un problema</button>
      <a className="btn soft" style={{ marginTop: 8, textDecoration: "none" }} href={`mailto:${CORREO_SOPORTE}`}><Ic n="mail" /> {CORREO_SOPORTE}</a>
    </>
  );
}

function HojaProblema() {
  const { cerrarHoja, aviso } = useNav();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const ok = texto.trim().length >= 5;
  async function enviar() {
    if (!ok || enviando) return;
    setEnviando(true);
    try {
      await api.reportarProblema({ texto: texto.trim() });
      cerrarHoja();
      aviso("Gracias. Lo revisaremos pronto.");
    } catch (e) {
      aviso(errorDe(e).mensaje);
      setEnviando(false);
    }
  }
  return (
    <>
      <TituloHoja>Reportar un problema</TituloHoja>
      <p className="sub" style={{ marginBottom: 10 }}>Cuéntanos qué pasó. Si es sobre una foto, un reel o un usuario, usa mejor su botón ⋯ para reportarlo.</p>
      <textarea className="field" maxLength={1000} placeholder="Ej: al publicar un video se queda en 'Procesando'…" aria-label="Describe el problema" value={texto} onChange={(e) => setTexto(e.target.value)} style={{ minHeight: 120 }} />
      <p style={{ textAlign: "right", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{texto.length}/1000</p>
      <button className={`btn ${ok && !enviando ? "grad" : "off"}`} style={{ marginTop: 10 }} onClick={enviar}>{enviando ? "Enviando…" : "Enviar"}</button>
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, textAlign: "center" }}>También puedes escribirnos a <a href={`mailto:${CORREO_SOPORTE}`}>{CORREO_SOPORTE}</a></p>
    </>
  );
}

function HojaEliminarCuenta() {
  const { perfil } = useSesion();
  const { cerrarHoja, aviso } = useNav();
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const ok = texto.trim().toUpperCase() === "ELIMINAR";
  async function eliminar() {
    if (!ok || ocupado) return;
    setOcupado(true);
    try {
      await api.eliminarCuenta({});
      cerrarHoja();
      await signOut(auth).catch(() => {});
    } catch (e) {
      aviso(errorDe(e).mensaje);
      setOcupado(false);
    }
  }
  return (
    <>
      <TituloHoja>Eliminar tu cuenta</TituloHoja>
      <p className="sub" style={{ lineHeight: 1.5 }}>
        Se borrarán para siempre tu perfil @{perfil?.username}, tus datos privados, tus monedas, tu colección, tus reels, tus comentarios y tus publicaciones.
        Las fotos que otras personas ya desbloquearon seguirán en su colección, pero saldrán del feed.
      </p>
      <p className="lbl">Escribe ELIMINAR para confirmar</p>
      <div className="field"><input value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" aria-label="Escribe ELIMINAR para confirmar" placeholder="ELIMINAR" /></div>
      <button className={`btn ${ok && !ocupado ? "danger" : "off"}`} style={{ marginTop: 14 }} onClick={eliminar}>{ocupado ? "Eliminando…" : "Eliminar mi cuenta"}</button>
      <button className="btn soft" style={{ marginTop: 8 }} onClick={cerrarHoja}>Cancelar</button>
    </>
  );
}
