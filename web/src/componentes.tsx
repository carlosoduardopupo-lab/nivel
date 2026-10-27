import { useEffect, useState, type ReactNode } from "react";
import { art } from "./arte";
import { Ic } from "./iconos";
import { useNav } from "./nav";
import { useSesion, vidasAhora } from "./sesion";
import { nf, urlDeRuta } from "./util";

export function Corazones({ vidas }: { vidas?: number }) {
  const { privado } = useSesion();
  const v = vidas ?? vidasAhora(privado);
  return (
    <span className="hearts" aria-label={`${v} vidas`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < v ? "" : "off"}><Ic n="heart" lleno /></span>
      ))}
    </span>
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

export function Avatar({ url, tam, borde }: { url: string | null | undefined; tam: number; borde?: string }) {
  return (
    <div className="ava" style={{ width: tam, height: tam, border: borde, background: "var(--surface2)" }}>
      {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <Arte fondo="#FAC775" />}
    </div>
  );
}

/** Imagen guardada en Storage (respeta las reglas: la original solo si está desbloqueada). */
export function ImagenStorage({ ruta, video = false, controles = false }: { ruta: string | null | undefined; video?: boolean; controles?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  useEffect(() => {
    let vivo = true;
    setUrl(null);
    setFallo(false);
    if (ruta) urlDeRuta(ruta).then((u) => vivo && setUrl(u), () => vivo && setFallo(true));
    return () => { vivo = false; };
  }, [ruta]);
  const estilo = { width: "100%", height: "100%", objectFit: "cover" as const, display: "block" };
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
