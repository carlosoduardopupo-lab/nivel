import { useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut,
} from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { api, errorDe } from "../api";
import { Avatar } from "../componentes";
import { auth, db, storage } from "../firebase";
import { Ic } from "../iconos";
import { useSesion } from "../sesion";
import { borrarReferido, INTERESES, leerReferido, reducirImagen } from "../util";

/** Edad para una fecha "AAAA-MM-DD" (la del selector de fecha). */
function edad(fecha: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  const A = +m[1], M = +m[2], D = +m[3];
  if (A < 1900) return null;
  const f = new Date(A, M - 1, D);
  if (f.getMonth() !== M - 1 || f.getDate() !== D) return null; // p. ej. 31 de febrero
  const t = new Date();
  let e = t.getFullYear() - A;
  if (t < new Date(t.getFullYear(), M - 1, D)) e--;
  return e;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Día, mes y año en tres desplegables: el selector de fecha nativo no funciona bien en iPhone. Devuelve "AAAA-MM-DD" o "". */
function SelectorFecha({ valor, cambiar }: { valor: string; cambiar: (v: string) => void }) {
  const [a0, m0, d0] = valor ? valor.split("-") : ["", "", ""];
  const [p, setP] = useState({ d: d0 ? String(+d0) : "", m: m0 ? String(+m0) : "", a: a0 });
  const hoy = new Date().getFullYear();
  const dias = p.m ? new Date(+p.a || 2000, +p.m, 0).getDate() : 31;
  function poner(k: "d" | "m" | "a", v: string) {
    const n = { ...p, [k]: v };
    setP(n);
    cambiar(n.d && n.m && n.a ? `${n.a}-${n.m.padStart(2, "0")}-${n.d.padStart(2, "0")}` : "");
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr 1.2fr", gap: 8 }}>
      <div className="field"><select aria-label="Día de nacimiento" value={p.d} onChange={(e) => poner("d", e.target.value)}>
        <option value="" disabled>Día</option>
        {Array.from({ length: dias }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
      </select></div>
      <div className="field"><select aria-label="Mes de nacimiento" value={p.m} onChange={(e) => poner("m", e.target.value)}>
        <option value="" disabled>Mes</option>
        {MESES.map((m, i) => <option key={m} value={i + 1}>{m[0].toUpperCase() + m.slice(1)}</option>)}
      </select></div>
      <div className="field"><select aria-label="Año de nacimiento" value={p.a} onChange={(e) => poner("a", e.target.value)}>
        <option value="" disabled>Año</option>
        {Array.from({ length: hoy - 1900 + 1 }, (_, i) => hoy - i).map((a) => <option key={a} value={a}>{a}</option>)}
      </select></div>
    </div>
  );
}

const mensajeAuth = (e: unknown) => {
  const c = (e as { code?: string }).code ?? "";
  if (c.includes("email-already-in-use")) return "Ese correo ya tiene cuenta. Inicia sesión.";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "Correo o contraseña incorrectos.";
  if (c.includes("weak-password")) return "La contraseña es muy débil.";
  if (c.includes("popup-closed")) return "Se cerró la ventana de Google.";
  if (c.includes("too-many-requests")) return "Demasiados intentos. Espera un momento.";
  return "No se pudo continuar. Inténtalo de nuevo.";
};

/** Registro en 4 pasos. Si ya hay sesión pero falta el perfil, empieza en el paso 2. */
export function Registro({ alTerminar }: { alTerminar: (cuentaNueva: boolean) => void }) {
  const { usuario, perfil } = useSesion();
  const [paso, setPaso] = useState(usuario ? 1 : 0);
  const [modo, setModo] = useState<"crear" | "entrar">("crear");
  const [d, setD] = useState({ mail: "", pass: "", name: "", fecha: "", codigo: leerReferido() ?? "", terms: false, user: "" });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [foto, setFoto] = useState<Blob | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [nombre, setNombre] = useState<{ ok: boolean; txt: string }>({ ok: false, txt: "Letras, números y guion bajo." });
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  // Si inició sesión con una cuenta que ya tiene perfil, no hay nada que registrar.
  useEffect(() => {
    if (perfil && paso < 3) alTerminar(false);
  }, [perfil, paso, alTerminar]);

  const set = (k: keyof typeof d, v: string | boolean) => setD((x) => ({ ...x, [k]: v }));
  const e = edad(d.fecha);

  // Comprobación del nombre de usuario en el servidor (con pausa para no llamar en cada tecla).
  useEffect(() => {
    const v = d.user.trim().toLowerCase();
    if (!v) return setNombre({ ok: false, txt: "Letras, números y guion bajo." });
    if (v.length < 3) return setNombre({ ok: false, txt: "Mínimo 3 caracteres" });
    if (!/^[a-z0-9_]+$/.test(v)) return setNombre({ ok: false, txt: "Solo letras, números y guion bajo" });
    setNombre({ ok: false, txt: "Comprobando…" });
    const t = setTimeout(() => {
      api.nombreDisponible({ username: v }).then(
        (r) => setNombre({ ok: r.disponible, txt: r.mensaje }),
        (err) => setNombre({ ok: false, txt: errorDe(err).mensaje }),
      );
    }, 400);
    return () => clearTimeout(t);
  }, [d.user]);

  const valido = [
    /^\S+@\S+\.\S+$/.test(d.mail) && d.pass.length >= (modo === "crear" ? 8 : 1),
    d.name.trim().length >= 3 && e !== null && e >= 18 && d.terms,
    nombre.ok,
    sel.size >= 3,
    true,
  ][paso];

  async function continuar() {
    if (!valido || ocupado) return;
    setError(null);
    if (paso === 0) {
      setOcupado(true);
      try {
        if (modo === "crear") await createUserWithEmailAndPassword(auth, d.mail.trim(), d.pass);
        else { await signInWithEmailAndPassword(auth, d.mail.trim(), d.pass); return; } // App decide adónde ir
        setPaso(1);
      } catch (err) {
        setError(mensajeAuth(err));
      } finally {
        setOcupado(false);
      }
      return;
    }
    if (paso === 3) {
      setOcupado(true);
      try {
        await api.registrar({
          username: d.user.trim().toLowerCase(),
          nombreReal: d.name.trim(),
          fechaNacimiento: d.fecha,
          intereses: [...sel],
          aceptaTerminos: d.terms,
          referidoPor: d.codigo.trim() || undefined,
        });
        borrarReferido();
        const uid = auth.currentUser!.uid;
        if (foto) {
          const r = ref(storage, `avatares/${uid}.jpg`);
          await uploadBytes(r, foto, { contentType: "image/jpeg" });
          await updateDoc(doc(db, "users", uid), { avatarUrl: await getDownloadURL(r) });
        }
        setPaso(4);
      } catch (err) {
        const { codigo, mensaje } = errorDe(err);
        setError(mensaje);
        if (codigo === "username-ocupado") setPaso(2);
        if (codigo === "menor-de-edad" || codigo === "fecha-invalida") setPaso(1);
      } finally {
        setOcupado(false);
      }
      return;
    }
    if (paso === 4) return alTerminar(true);
    setPaso(paso + 1);
  }

  async function conGoogle() {
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      // Si ya tenía perfil, App lo lleva al feed; si no, seguimos con el paso 2.
      setPaso(1);
    } catch (err) {
      setError(mensajeAuth(err));
    }
  }

  async function elegirFoto(f: File | undefined) {
    if (!f) return;
    try {
      const b = await reducirImagen(f, 400, 0.85);
      setFoto(b);
      setFotoUrl(URL.createObjectURL(b));
    } catch {
      setError("No se pudo leer esa imagen.");
    }
  }

  const textoBoton = paso === 4 ? "Empezar a jugar" : paso === 3 ? "Terminar" : paso === 0 && modo === "entrar" ? "Entrar" : "Continuar";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBlock: "14px 4px" }}>
        <button className="iconbtn" aria-label="Atrás" style={{ visibility: paso > 1 && paso < 4 ? "visible" : "hidden" }} onClick={() => setPaso(paso - 1)}>
          <Ic n="back" />
        </button>
        <div style={{ flex: 1, display: "flex", gap: 6 }}>
          {paso < 4 && [0, 1, 2, 3].map((i) => (
            <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= paso ? "var(--grad)" : "var(--surface2)" }} />
          ))}
        </div>
        <span style={{ width: 38 }} />
      </div>

      <div style={{ paddingTop: 10 }} className="paso" key={paso}>
        {paso === 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "center", margin: "18px 0" }}>
              <span style={{ width: 72, height: 72, borderRadius: 22, background: "var(--grad)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 34 }}><Ic n="eye" /></span>
            </div>
            <p className="h2" style={{ textAlign: "center", fontSize: 30 }}>¿Qué hay detrás<br />de lo borroso?</p>
            <p className="sub" style={{ textAlign: "center", marginBottom: 22 }}>Adivina y lo sabrás.</p>
            <button className="btn soft" onClick={conGoogle}>Continuar con Google</button>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 10px", color: "var(--muted)", fontSize: 12 }}>
              <span style={{ flex: 1, height: 1, background: "var(--line)" }} />o con correo<span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            </div>
            <div className="field"><span style={{ color: "var(--muted)" }}><Ic n="mail" /></span><input type="email" placeholder="tu@correo.com" aria-label="Correo" value={d.mail} onChange={(x) => set("mail", x.target.value)} autoComplete="email" /></div>
            <div className="field" style={{ marginTop: 8 }}><span style={{ color: "var(--muted)" }}><Ic n="key" /></span><input type="password" placeholder={modo === "crear" ? "Contraseña (mín. 8)" : "Contraseña"} aria-label="Contraseña" value={d.pass} onChange={(x) => set("pass", x.target.value)} autoComplete={modo === "crear" ? "new-password" : "current-password"} onKeyDown={(x) => x.key === "Enter" && continuar()} /></div>
            <p style={{ textAlign: "center", fontSize: 13, marginTop: 14 }}>
              {modo === "crear" ? "¿Ya tienes cuenta? " : "¿No tienes cuenta? "}
              <button style={{ fontWeight: 700, color: "var(--rosa)" }} onClick={() => { setModo(modo === "crear" ? "entrar" : "crear"); setError(null); }}>
                {modo === "crear" ? "Inicia sesión" : "Crea una"}
              </button>
            </p>
            {modo === "entrar" && (
              <p style={{ textAlign: "center", fontSize: 13, marginTop: 8 }}>
                <button style={{ color: "var(--muted)" }} onClick={() => /^\S+@\S+\.\S+$/.test(d.mail) ? sendPasswordResetEmail(auth, d.mail.trim()).then(() => setError("Te enviamos un correo para cambiar la contraseña.")) : setError("Escribe tu correo primero.")}>
                  Olvidé mi contraseña
                </button>
              </p>
            )}
          </>
        )}

        {paso === 1 && (
          <>
            <p className="h2">Tus datos</p>
            <p className="sub"><Ic n="shield" /> Privados. Nadie más los ve.</p>
            <p className="lbl">Nombre real</p>
            <div className="field"><input placeholder="Nombre y apellido" aria-label="Nombre real" value={d.name} onChange={(x) => set("name", x.target.value)} autoComplete="name" /></div>
            <p className="lbl">Fecha de nacimiento</p>
            <SelectorFecha valor={d.fecha} cambiar={(v) => set("fecha", v)} />
            <p style={{ fontSize: 12, margin: "8px 2px 0", color: e === null ? "var(--muted)" : e < 18 ? "var(--rojo)" : "var(--verde)" }}>
              {e === null ? "Debes tener 18 años o más." : e < 18 ? "Lo sentimos, debes tener 18 años o más para usar la app." : "Edad confirmada"}
            </p>
            <p className="lbl">Código de invitación <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>· opcional</span></p>
            <div className="field"><span style={{ color: "var(--muted)" }}><Ic n="share" /></span><input placeholder="Si un amigo te invitó" aria-label="Código de invitación" autoComplete="off" maxLength={21} value={d.codigo} onChange={(x) => set("codigo", x.target.value.replace(/\s/g, ""))} /></div>
            <button role="checkbox" aria-checked={d.terms} onClick={() => set("terms", !d.terms)} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 18, width: "100%" }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", ...(d.terms ? { background: "var(--grad)" } : { border: "2px solid var(--muted)" }) }}>{d.terms && <Ic n="check" />}</span>
              <span style={{ fontSize: 13, lineHeight: 1.4 }}>Confirmo que soy mayor de edad y acepto los <a href="/terminos/" target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} style={{ textDecoration: "underline" }}>Términos</a> y la <a href="/privacidad/" target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} style={{ textDecoration: "underline" }}>Política de privacidad</a>.</span>
            </button>
          </>
        )}

        {paso === 2 && (
          <>
            <p className="h2">Tu perfil público</p>
            <p className="sub">Es lo único que verán los demás.</p>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 22 }}>
              <button className="ava" onClick={() => archivo.current?.click()} aria-label="Elegir foto de perfil" style={{ width: 104, height: 104, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "var(--muted)" }}>
                {fotoUrl ? <Avatar url={fotoUrl} tam={104} /> : <Ic n="camera" />}
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--rosa)" }}>{fotoUrl ? "Cambiar foto" : "Elegir foto (opcional)"}</span>
              <input ref={archivo} type="file" accept="image/*" hidden onChange={(x) => elegirFoto(x.target.files?.[0])} />
            </div>
            <p className="lbl">Nombre de usuario</p>
            <div className="field">
              <span style={{ color: "var(--muted)" }}>@</span>
              <input maxLength={20} placeholder="tu_nombre" autoComplete="off" aria-label="Nombre de usuario" value={d.user} onChange={(x) => set("user", x.target.value)} />
              {d.user && <span style={{ color: nombre.ok ? "var(--verde)" : "var(--rojo)" }}><Ic n={nombre.ok ? "check" : "x"} /></span>}
            </div>
            <p style={{ fontSize: 12, margin: "6px 2px 0", color: !d.user ? "var(--muted)" : nombre.ok ? "var(--verde)" : "var(--rojo)" }}>{nombre.txt}</p>
          </>
        )}

        {paso === 3 && (
          <>
            <p className="h2">¿Qué te gusta?</p>
            <p className="sub" style={{ marginBottom: 16 }}>{sel.size >= 3 ? `${sel.size} elegidos · puedes elegir más` : "Elige al menos 3. Lo usamos para sugerirte creadores."}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {INTERESES.map((t) => (
                <button key={t} className={`chip ${sel.has(t) ? "on" : ""}`} onClick={() => setSel((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else if (n.size < 10) n.add(t); return n; })}>{t}</button>
              ))}
            </div>
          </>
        )}

        {paso === 4 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 60 }}>
            <Avatar url={fotoUrl} tam={96} />
            <p className="h2" style={{ marginTop: 16 }}>¡Listo, @{d.user.trim().toLowerCase()}!</p>
            <p className="sub">Tienes 3 vidas y 100 monedas de regalo para empezar.</p>
            <span className="hearts" style={{ fontSize: 26, gap: 6, marginTop: 10 }}>{[0, 1, 2].map((i) => <Ic key={i} n="heart" lleno />)}</span>
          </div>
        )}

        {error && <p role="alert" style={{ fontSize: 13, color: "var(--rojo)", marginTop: 14, textAlign: "center" }}>{error}</p>}
        {paso === 1 && usuario && (
          <p style={{ textAlign: "center", fontSize: 12, marginTop: 18 }}>
            <button style={{ color: "var(--muted)" }} onClick={() => signOut(auth).then(() => setPaso(0))}>Usar otra cuenta</button>
          </p>
        )}
      </div>

      <div style={{ height: 70 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px max(20px,env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) max(20px,env(safe-area-inset-left,0px))", background: "var(--bg)" }}>
        <button className={`btn ${valido && !ocupado ? "grad" : "off"}`} onClick={continuar}>{ocupado ? "Un momento…" : textoBoton}</button>
      </div>
    </>
  );
}
