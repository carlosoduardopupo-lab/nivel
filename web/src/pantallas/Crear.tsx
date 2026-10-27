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
const vacia = (): Campos => ({ texto: "", correcta: "", f1: "", f2: "" });

export function Crear() {
  const { perfil } = useSesion();
  const { ir, reiniciar, abrirHoja } = useNav();
  const [tipo, setTipo] = useState<"foto" | "video">("foto");
  const [archivo, setArchivo] = useState<Blob | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [borroso, setBorroso] = useState(false);
  const [precio, setPrecio] = useState(1);
  const [qs, setQs] = useState<Campos[]>([vacia()]);
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

  const cambiar = (i: number, k: keyof Campos, v: string) => setQs((a) => a.map((q, j) => (j === i ? { ...q, [k]: v } : q)));

  const faltan: string[] = [];
  if (!archivo) faltan.push(tipo === "video" ? "el video" : "la foto");
  qs.forEach((q, i) => {
    if (!q.texto.trim() || !q.correcta.trim() || !q.f1.trim() || !q.f2.trim()) faltan.push(qs.length > 1 ? `la pregunta ${i + 1}` : "la pregunta");
  });
  const repetida = qs.findIndex((q) => {
    const r = [q.correcta, q.f1, q.f2].map((x) => x.trim().toLowerCase()).filter(Boolean);
    return new Set(r).size < r.length;
  });
  const textos = qs.map((q) => q.texto.trim().toLowerCase()).filter(Boolean);
  const preguntasIguales = new Set(textos).size < textos.length;
  const ok = !faltan.length && repetida < 0 && !preguntasIguales;

  async function publicar() {
    if (!ok || progreso !== null || !archivo) return;
    setError(null);
    setProgreso(0);
    try {
      const preguntas: PreguntaNueva[] = qs.map((q) => ({ texto: q.texto.trim(), correcta: q.correcta.trim(), falsas: [q.f1.trim(), q.f2.trim()] }));
      const { ruta } = await api.crearPublicacion({ tipo, precio, preguntas });
      const tarea = uploadBytesResumable(ref(storage, ruta), archivo, { contentType: tipo === "foto" ? "image/jpeg" : archivo.type || "video/mp4" });
      tarea.on("state_changed", (s) => setProgreso(s.bytesTransferred / s.totalBytes));
      await tarea;
      abrirHoja(
        <>
          <div style={{ textAlign: "center", paddingTop: 6 }}>
            <span style={{ display: "inline-flex", width: 72, height: 72, borderRadius: "50%", background: "var(--grad)", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 34, animation: "pop .45s ease" }}><Ic n="check" /></span>
            <p className="h2" style={{ fontSize: 22, marginTop: 14 }}>¡Publicada!</p>
            <p className="sub">Aparecerá en tu perfil en unos segundos.</p>
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

  const mensaje = preguntasIguales ? "Las preguntas deben ser distintas" : repetida >= 0 ? "Las tres respuestas deben ser distintas" : ok ? "Lista para publicar" : "Falta: " + faltan.join(", ");

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

      {qs.map((q, i) => (
        <div key={i}>
          <p className="lbl">{i === 0 ? "Pregunta" : `Pregunta ${i + 1}`}{i > 0 && <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}> · si fallan, al día siguiente</span>}</p>
          <textarea className="field" maxLength={90} placeholder={i === 0 ? "Ej: ¿Cuál es mi sabor de helado favorito?" : "Otra pregunta sobre ti"} aria-label={`Pregunta ${i + 1}`} value={q.texto} onChange={(e) => cambiar(i, "texto", e.target.value)} />
          <p style={{ textAlign: "right", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{q.texto.length}/90</p>
          <div className="field"><span style={{ color: "var(--verde)" }}><Ic n="check" /></span><input maxLength={30} placeholder="La verdadera" aria-label={`Respuesta correcta ${i + 1}`} value={q.correcta} onChange={(e) => cambiar(i, "correcta", e.target.value)} /></div>
          <div className="field" style={{ marginTop: 8 }}><span style={{ color: "var(--rojo)" }}><Ic n="x" /></span><input maxLength={30} placeholder="Falsa 1" aria-label={`Respuesta falsa 1 de la pregunta ${i + 1}`} value={q.f1} onChange={(e) => cambiar(i, "f1", e.target.value)} /></div>
          <div className="field" style={{ marginTop: 8 }}><span style={{ color: "var(--rojo)" }}><Ic n="x" /></span><input maxLength={30} placeholder="Falsa 2" aria-label={`Respuesta falsa 2 de la pregunta ${i + 1}`} value={q.f2} onChange={(e) => cambiar(i, "f2", e.target.value)} /></div>
        </div>
      ))}
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

      {error && <p role="alert" style={{ textAlign: "center", fontSize: 13, color: "var(--rojo)", marginTop: 16 }}>{error}</p>}
      <p style={{ textAlign: "center", fontSize: 12, color: repetida >= 0 || preguntasIguales ? "var(--rojo)" : "var(--muted)", margin: "22px 0 8px" }}>
        {progreso !== null ? `Subiendo… ${Math.round(progreso * 100)}%` : mensaje}
      </p>
      <button className={`btn ${ok && progreso === null ? "grad" : "off"}`} onClick={publicar}>Publicar</button>
    </>
  );
}
