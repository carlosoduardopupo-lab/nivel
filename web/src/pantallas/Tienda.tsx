import { useEffect, useState } from "react";
import { api, errorDe } from "../api";
import { AvisoFasePrueba, Barra, Corazones, TarjetaInvitar } from "../componentes";
import { Ic } from "../iconos";
import { useNav } from "../nav";
import { useSesion, vidasAhora } from "../sesion";
import { ADMINS, comisionRetiro, dinero, FASE_PRUEBA, fmtFalta, nf } from "../util";

// Los paquetes reales se definen en el servidor (functions/src/pagos.ts). Aquí solo se muestran.
// x = % de monedas extra por dólar respecto al paquete de 150 por $1.99 (redondeado hacia abajo).
const PAQUETES = [
  { id: "p150", m: 150, p: 1.99, x: 0 },
  { id: "p550", m: 550, p: 4.99, x: 46 },
  { id: "p1150", m: 1150, p: 9.99, x: 52, tag: "MÁS POPULAR", col: "var(--rosa)" },
  { id: "p2400", m: 2400, p: 19.99, x: 59, tag: "MEJOR PRECIO", col: "var(--verde)" },
];

export function Tienda() {
  const { privado, usuario } = useSesion();
  const { aviso } = useNav();
  const [sel, setSel] = useState(2);
  const [pagando, setPagando] = useState(false);
  // En fase de prueba solo compran los administradores (con la clave de prueba de Stripe).
  const compraAbierta = !FASE_PRUEBA || (!!usuario && ADMINS.includes(usuario.uid));
  // Al abrir la tienda (también al volver de Stripe) se suman las monedas de los pagos ya cobrados.
  useEffect(() => {
    if (!compraAbierta) return;
    api.confirmarPagos({}).then((r) => { if (r.monedas) aviso(`¡Listo! +${nf(r.monedas)} monedas`); }, () => {});
  }, [compraAbierta, aviso]);
  async function comprar() {
    setPagando(true);
    try {
      const { url } = await api.crearPago({ paquete: k.id, origen: location.origin });
      location.href = url;
    } catch (e) {
      aviso(errorDe(e).mensaje);
      setPagando(false);
    }
  }
  const vidas = vidasAhora(privado);
  const k = PAQUETES[sel];
  return (
    <>
      <Barra titulo="Monedas" derecha={<span className="pill"><span style={{ color: "var(--naranja)" }}><Ic n="coin" /></span>{nf(privado?.monedas ?? 0)}</span>} />
      {vidas === 0 && (
        <div className="wallet" style={{ margin: "6px 0 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Corazones vidas={0} /><b>Te quedaste sin vidas</b></div>
          <p style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>Vuelven en <b>{fmtFalta((privado?.vidasVuelvenEn?.toMillis() ?? 0) - Date.now())}</b>, o sigue jugando ahora con monedas.</p>
        </div>
      )}
      <div style={{ textAlign: "center", padding: "6px 0 18px" }}>
        <span className="coin" style={{ width: 64, height: 64, borderRadius: "50%", fontSize: 32, margin: "0 auto" }}><Ic n="coin" /></span>
        <p className="h2" style={{ fontSize: 22, marginTop: 10 }}>Consigue monedas</p>
        <p className="sub">Úsalas para ver respuestas y avanzar</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }} role="radiogroup">
        {PAQUETES.map((p, i) => (
          <button key={p.id} className={`pack ${i === sel ? "on" : ""}`} role="radio" aria-checked={i === sel} onClick={() => setSel(i)}>
            {p.tag && <span className="ribbon" style={{ background: p.col }}>{p.tag}</span>}
            <span className="coin"><Ic n="coin" /></span>
            <span style={{ flex: 1 }}>
              <b style={{ fontFamily: "var(--f-display)", fontSize: 18 }}>{nf(p.m)}</b> <span style={{ fontSize: 13, color: "var(--muted)" }}>monedas</span>
              <span style={{ display: "block", fontSize: 12, marginTop: 2, fontWeight: 600, color: p.x ? "var(--verde)" : "var(--muted)" }}>{p.x ? `+${p.x}% de regalo` : "Para probar"}</span>
            </span>
            <b style={{ fontSize: 16, fontVariantNumeric: "tabular-nums" }}>${p.p.toFixed(2)}</b>
          </button>
        ))}
      </div>
      <TarjetaInvitar />
      <p style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginTop: 16 }}><Ic n="lock" /> Pago seguro · Las monedas no caducan</p>
      {FASE_PRUEBA && <AvisoFasePrueba />}
      {compraAbierta && (
        <>
          {FASE_PRUEBA && <p style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginTop: 12 }}>Modo prueba de Stripe (solo administradores): paga con la tarjeta 4242 4242 4242 4242, cualquier fecha futura y cualquier CVC.</p>}
          <div style={{ height: 70 }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px max(16px,env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))", background: "var(--bg)" }}>
            <button className={`btn ${pagando ? "off" : "grad"}`} disabled={pagando} onClick={comprar}>{pagando ? "Abriendo el pago…" : `Comprar ${nf(k.m)} monedas · $${k.p.toFixed(2)}`}</button>
          </div>
        </>
      )}
    </>
  );
}

export function Retiro() {
  const { privado } = useSesion();
  const disp = privado?.gananciasDisponibles ?? 0;
  const com = disp ? comisionRetiro(disp) : 0;
  return (
    <>
      <Barra titulo="Retirar ganancias" />
      <div className="wallet">
        <small>DISPONIBLE PARA RETIRAR</small>
        <div className="num" style={{ fontSize: 34, color: "#6FD6AE" }}>{dinero(disp)}</div>
        <p style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}><Ic n="clock" /> En espera: {dinero(privado?.gananciasEnEspera ?? 0)} · lo ganado se libera a los 7 días</p>
      </div>
      <div style={{ marginTop: 14, background: "var(--surface2)", borderRadius: 14, padding: "10px 14px" }}>
        <div className="line"><span style={{ color: "var(--muted)" }}>Retiras</span><span>{dinero(disp)}</span></div>
        <div className="line"><span style={{ color: "var(--muted)" }}>Comisión de envío</span><span style={{ color: "var(--rojo)" }}>−{dinero(com)}</span></div>
        <div className="line" style={{ borderTop: "1px solid var(--line)", marginTop: 4, paddingTop: 9 }}><b>Recibes</b><b style={{ color: "var(--verde)", fontSize: 16 }}>{dinero(Math.max(0, disp - com))}</b></div>
      </div>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 2px 0" }}>Mínimo para retirar: $50. Comisión: $2 + 0.25% + $0.25.</p>
      <div style={{ marginTop: 18, padding: 14, borderRadius: 14, border: "1.5px dashed var(--muted)" }}>
        <b style={{ fontSize: 14 }}>Conectar cuenta bancaria</b>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>Los retiros con Stripe llegan en la Fase 4.</p>
      </div>
    </>
  );
}
