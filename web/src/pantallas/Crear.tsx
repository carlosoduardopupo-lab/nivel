import { useEffect, useRef, useState } from "react";
import { ref, uploadBytesResumable } from "firebase/storage";
import { api, errorDe, type PreguntaNueva } from "../api";
import { Barra } from "../componentes";
import { storage } from "../firebase";
import { Ic } from "../iconos";
import { useNav } from "../nav";
import { useSesion } from "../sesion";
import { duracionVideo, monedasTxt, reducirImagen, tiempoDe } from "../util";

type Campos = { texto: string; correcta: string; f1: string; f2: string };

export function Crear() {
  const { perfil } = useSesion();
  const { ir, reiniciar, abrirHoja } = useNav();
  const [tipo, setTipo] = useState<"foto" | "video">("foto");
  const [archivo, setArchivo] = useState<Blob | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [borroso, setBorroso] = useState(false);
  const [precio, setPrecio] = useState(1);
  const [q, setQ] = useState<Campos>({ texto: "", correcta: "", f1: "", f2: "" });
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const min = tipo === "video" ? 3 : 1;
  const max = perfil?.esVip ? 100 : 20;
  useEffect(() => { setPrecio((p) => Math.min(max, Math.max(p, min))); }, [min, max]);

  async function elegir(f: File | undefined) {
    setError(null);
    if (!f) return;
    try {
      if (tipo === "foto") {
        if (!f.type.startsWith("image/")) return setError("Elige una imagen.");
        const b = await reducirImagen(f, 1600);
        setArchivo(b);
        setVista(URL.createObjectURL(b));
      } else {
        if (!f.type.startsWith("video/")) return setError("Elige un video.");
        if (f.size > 50 * 1024 * 1024) return setError("El video pesa más de 50 MB.");
        const s = await duracionVideo(f);
        if (s > 30.5) return setError(`El video dura ${Math.round(s)} segundos; el máximo es 30.`);
        setArchivo(f);
        setVista(URL.createObjectURL(f));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const cambiar = (k: keyof Campos, v: string) => setQ((x) => ({ ...x, [k]: v }));

  const faltan: string[] = [];
  if (!archivo) faltan.push(tipo === "video" ? "el video" : "la foto");
  if (!q.texto.trim()) faltan.push("la pregunta");
  if (!q.correcta.trim()) faltan.push("la correcta");
  if (!q.f1.trim() || !q.f2.trim()) faltan.push("las falsas");
  const respuestas = [q.correcta, q.f1, q.f2].map((x) => x.trim().toLowerCase()).filter(Boolean);
  const repetida = new Set(respuestas).size < respuestas.length;
  const ok = !faltan.length && !repetida;

  async function publicar() {
    if (!ok || progreso !== null || !archivo) return;
    setError(null);
    setProgreso(0);
    try {
      const pregunta: PreguntaNueva = { texto: q.texto.trim(), correcta: q.correcta.trim(), falsas: [q.f1.trim(), q.f2.trim()] };
      const { ruta } = await api.crearPublicacion({ tipo, precio, pregunta });
      const tarea = uploadBytesResumable(ref(storage, ruta), archivo, { contentType: tipo === "foto" ? "image/jpeg" : archivo.type || "video/mp4" });
      tarea.on("state_changed", (s) => setProgreso(s.bytesTransferred / s.totalBytes));
      await tarea;
      abrirHoja(
        <>
          <div style={{ textAlign: "center", paddingTop: 6 }}>
            <span style={{ display: "inline-flex", width: 72, height: 72, borderRadius: "50%", background: "var(--grad)", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 34, animation: "pop .45s ease" }}><Ic n="check" /></span>
            <p className="h2" style={{ fontSize: 22, marginTop: 14 }}>Enviada a revisión</p>
            <p className="sub">Aparecerá en tu perfil cuando se apruebe.</p>
          </div>
          <button className="btn dark" style={{ marginTop: 18 }} onClick={() => { reiniciar({ n: "feed" }); ir({ n: "perfil" }); }}>Ver mi perfil</button>
          <button className="btn soft" style={{ marginTop: 8 }} onClick={() => { reiniciar({ n: "feed" }); ir({ n: "crear" }); }}>Crear otra</button>
        </>,
      );
    } catch (e) {
      setError(errorDe(e).mensaje);
      setProgreso(null);
    }
  }

  const mensaje = repetida ? "Las tres respuestas deben ser distintas" : ok ? "Se revisará antes de publicarse" : "Falta: " + faltan.join(", ");

  return (
    <>
      <Barra titulo="Nueva publicación" icono="x" />
      <div className="seg" role="tablist">
        {(["foto", "video"] as const).map((t) => (
          <button key={t} className={tipo === t ? "on" : ""} role="tab" aria-selected={tipo === t} onClick={() => { setTipo(t); setArchivo(null); setVista(null); }}>
            <Ic n={t === "foto" ? "photo" : "video"} /> {t === "foto" ? "Foto" : "Video"}
          </button>
        ))}
      </div>
      <div role="button" tabIndex={0} onClick={() => !archivo && input.current?.click()} onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
        style={{ position: "relative", marginTop: 14, aspectRatio: "1/1", maxWidth: "100%", borderRadius: 18, overflow: "hidden", background: "var(--surface2)", cursor: "pointer" }}>
        {vista ? (
          <>
            <div style={{ position: "absolute", inset: 0, ...(borroso ? { filter: "blur(14px)", transform: "scale(1.1)" } : {}) }}>
              {tipo === "foto" ? <img src={vista} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <video src={vista} muted playsInline loop autoPlay style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <button className="pill" style={{ position: "absolute", left: 10, bottom: 10, background: "rgba(20,14,18,.65)", color: "#fff" }} onClick={(e) => { e.stopPropagation(); setBorroso(!borroso); }}>
              <Ic n="eye" /> {borroso ? "Ver nítida" : "Ver como jugador"}
            </button>
            <button className="pill" style={{ position: "absolute", right: 10, bottom: 10, background: "rgba(20,14,18,.65)", color: "#fff" }} onClick={(e) => { e.stopPropagation(); input.current?.click(); }}>Cambiar</button>
          </>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center" }}>
            <span style={{ width: 56, height: 56, borderRadius: 16, background: "var(--grad)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 26 }}><Ic n={tipo === "video" ? "video" : "photo"} /></span>
            <b>Seleccionar {tipo}</b>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Una a la vez{tipo === "video" ? " · máx. 30 segundos" : ""}</span>
          </div>
        )}
        <input ref={input} type="file" accept={tipo === "foto" ? "image/*" : "video/*"} hidden onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      <p className="lbl">Pregunta</p>
      <textarea className="field" maxLength={90} placeholder="Ej: ¿Cuál es mi sabor de helado favorito?" aria-label="Pregunta" value={q.texto} onChange={(e) => cambiar("texto", e.target.value)} />
      <p style={{ textAlign: "right", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{q.texto.length}/90</p>
      <p className="lbl" style={{ marginTop: 6 }}>Respuesta correcta</p>
      <div className="field"><span style={{ color: "var(--verde)" }}><Ic n="check" /></span><input maxLength={30} placeholder="La verdadera" aria-label="Respuesta correcta" value={q.correcta} onChange={(e) => cambiar("correcta", e.target.value)} /></div>
      <p className="lbl">Respuestas falsas</p>
      <div className="field"><span style={{ color: "var(--rojo)" }}><Ic n="x" /></span><input maxLength={30} placeholder="Falsa 1" aria-label="Respuesta falsa 1" value={q.f1} onChange={(e) => cambiar("f1", e.target.value)} /></div>
      <div className="field" style={{ marginTop: 8 }}><span style={{ color: "var(--rojo)" }}><Ic n="x" /></span><input maxLength={30} placeholder="Falsa 2" aria-label="Respuesta falsa 2" value={q.f2} onChange={(e) => cambiar("f2", e.target.value)} /></div>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "6px 2px 0" }}>El orden de las respuestas se mezcla para cada jugador.</p>

      <p className="lbl">Precio</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface2)", borderRadius: 14, padding: "10px 12px" }}>
        <div>
          <p style={{ fontWeight: 700 }}><span style={{ color: "var(--naranja)" }}><Ic n="coin" /></span> {monedasTxt(precio)}</p>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{tiempoDe(precio)} segundos para responder · máximo {max}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="iconbtn" style={{ background: "var(--surface)", borderRadius: "50%", opacity: precio <= min ? 0.35 : 1 }} aria-label="Bajar precio" onClick={() => setPrecio(Math.max(min, precio - 1))}><Ic n="minus" /></button>
          <button className="iconbtn" style={{ background: "var(--surface)", borderRadius: "50%", opacity: precio >= max ? 0.35 : 1 }} aria-label="Subir precio" onClick={() => setPrecio(Math.min(max, precio + 1))}><Ic n="plus" /></button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginTop: 16, background: "var(--surface2)", borderRadius: 14, padding: 12 }}>
        <span style={{ color: "var(--rosa)", fontSize: 20 }}><Ic n="spark" /></span>
        <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>Si alguien falla, al día siguiente le toca una pregunta de otra de tus fotos (o una general nuestra). Tu respuesta nunca se le repite.</span>
      </div>

      {error && <p role="alert" style={{ textAlign: "center", fontSize: 13, color: "var(--rojo)", marginTop: 16 }}>{error}</p>}
      <p style={{ textAlign: "center", fontSize: 12, color: repetida ? "var(--rojo)" : "var(--muted)", margin: "22px 0 8px" }}>
        {progreso !== null ? `Subiendo… ${Math.round(progreso * 100)}%` : mensaje}
      </p>
      <button className={`btn ${ok && progreso === null ? "grad" : "off"}`} onClick={publicar}>Publicar</button>
    </>
  );
}
