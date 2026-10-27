import { useEffect, useState } from "react";
import { sendPasswordResetEmail, signOut } from "firebase/auth";
import { collection, doc, getDocs, orderBy, query, updateDoc, where } from "firebase/firestore";
import { api, errorDe } from "../api";
import { Barra, TituloHoja } from "../componentes";
import { auth, db } from "../firebase";
import { Ic } from "../iconos";
import { useNav } from "../nav";
import { useSesion } from "../sesion";
import { INTERESES, nf } from "../util";

type Fila = { i: string; t: string; s?: string; sw?: string; accion?: () => void };

export function Ajustes() {
  const { perfil, privado, usuario } = useSesion();
  const { ir, abrirHoja, cerrarHoja, aviso } = useNav();
  const [sw, setSw] = useState<Record<string, boolean>>(privado?.ajustes ?? {});
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
      { i: "ban", t: "Cuentas bloqueadas", s: "Ninguna", accion: pronto("Cuentas bloqueadas") },
    ]],
    ["Pagos", [
      { i: "bank", t: "Cuenta bancaria", s: "Sin conectar", accion: () => ir({ n: "retiro" }) },
      { i: "receipt", t: "Historial de compras", accion: () => abrirHoja(<HojaCompras />) },
      { i: "file", t: "Documentos de impuestos", s: "Formulario W-9 y 1099", accion: pronto("Documentos de impuestos") },
    ]],
    ["Ayuda", [
      { i: "help", t: "Centro de ayuda", accion: pronto("Centro de ayuda") },
      { i: "flag", t: "Reportar un problema", accion: pronto("Reportar un problema") },
      { i: "book", t: "Reglas del juego", accion: () => abrirHoja(<HojaReglas />) },
      { i: "file", t: "Términos y privacidad", accion: pronto("Términos y privacidad") },
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
        <button style={{ textAlign: "center", fontWeight: 700, fontSize: 13, color: "var(--rojo)", padding: 12 }} onClick={pronto("Eliminar cuenta")}>Eliminar cuenta</button>
      </div>
      <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted)" }}>Nivel · versión 0.2</p>
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
  ["Si fallas", "Un intento por foto al día. Al día siguiente te toca otra pregunta distinta: de otra foto del mismo creador o una general. Nunca se repiten."],
  ["Tiempo según el precio", "10 segundos con 1 moneda y 5 más por cada moneda extra, hasta 30."],
  ["Ver respuesta", "El botón con el precio siempre está disponible: pagas y la foto es tuya."],
  ["Precios", "De 1 a 20 monedas por foto (videos desde 3). Los creadores VIP pueden cobrar hasta 100."],
  ["Monedas de regalo", "Al registrarte recibes 100 monedas para ver fotos."],
  ["Creadores", "Reciben $0.005 por cada moneda comprada que se gasta en sus publicaciones (las de regalo no cuentan). Retiro mínimo de $50."],
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
