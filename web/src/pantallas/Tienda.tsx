import { useEffect, useState } from "react";
import { api, errorDe } from "../api";
import { AvisoFasePrueba, Barra, Cargando, Corazones, TarjetaInvitar } from "../componentes";
import { Ic } from "../iconos";
import { useNav } from "../nav";
import { useSesion, vidasAhora } from "../sesion";
import { ADMINS, comisionRetiro, dinero, FASE_PRUEBA, fmtFalta, nf, RETIRO_MINIMO, RETIROS_ABIERTOS, SEGUIDORES_PARA_RETIRAR } from "../util";

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
          <div style={{ height: 70 }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px max(16px,env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))", background: "var(--bg)" }}>
            <button className={`btn ${pagando ? "off" : "grad"}`} disabled={pagando} onClick={comprar}>{pagando ? "Abriendo el pago…" : `Comprar ${nf(k.m)} monedas · $${k.p.toFixed(2)}`}</button>
          </div>
        </>
      )}
    </>
  );
}

/** Países donde se puede cobrar (los mismos que PAISES_RETIRO en functions/src/pagos.ts). */
const PAISES = [["US", "Estados Unidos"], ["MX", "México"], ["ES", "España"], ["CO", "Colombia"], ["AR", "Argentina"], ["CL", "Chile"], ["PE", "Perú"],
  ["BR", "Brasil"], ["CA", "Canadá"], ["GB", "Reino Unido"], ["FR", "Francia"], ["IT", "Italia"], ["DE", "Alemania"], ["PT", "Portugal"]] as const;

export function Retiro() {
  const { privado, usuario, perfil } = useSesion();
  const { aviso } = useNav();
  const disp = privado?.gananciasDisponibles ?? 0;
  const seguidores = perfil?.seguidores ?? 0;
  const com = disp ? comisionRetiro(disp) : 0;
  // Hasta que los retiros se abran a todos, solo los administradores los prueban.
  const abierto = RETIROS_ABIERTOS || (!!usuario && ADMINS.includes(usuario.uid));
  // Lo ganado se acumula siempre; se puede retirar a partir de SEGUIDORES_PARA_RETIRAR.
  const activo = seguidores >= SEGUIDORES_PARA_RETIRAR;
  const [banco, setBanco] = useState<{ conectada: boolean; lista: boolean } | null>(null);
  const [pais, setPais] = useState("US");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (abierto) api.estadoBanco({}).then(setBanco, () => setBanco({ conectada: false, lista: false }));
  }, [abierto]);
  async function conectar() {
    setOcupado(true);
    try {
      location.href = (await api.conectarBanco({ pais, origen: location.origin })).url;
    } catch (e) {
      aviso(errorDe(e).mensaje);
      setOcupado(false);
    }
  }
  async function retirar() {
    setOcupado(true);
    try {
      const r = await api.retirar({});
      aviso(`Enviado: ${dinero(r.enviado)}. Llega a tu banco en unos días.`);
    } catch (e) {
      aviso(errorDe(e).mensaje);
    }
    setOcupado(false);
  }
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
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 2px 0" }}>Mínimo para retirar: $15. Comisión: $2 + 0.25% + $0.25.</p>
      {!activo ? (
        <div style={{ marginTop: 18, padding: 14, borderRadius: 14, background: "var(--surface2)" }}>
          <b style={{ fontSize: 14 }}><Ic n="lock" /> Tus ganancias se activan con {nf(SEGUIDORES_PARA_RETIRAR)} seguidores</b>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>Lo que ganas con tus fotos se va guardando. Cuando llegues a {nf(SEGUIDORES_PARA_RETIRAR)} seguidores podrás conectar tu banco y retirarlo.</p>
          <div className="bar" style={{ margin: "12px 0 4px" }}><i style={{ width: `${Math.min(100, Math.round((seguidores / SEGUIDORES_PARA_RETIRAR) * 100))}%` }} /></div>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>{nf(seguidores)} de {nf(SEGUIDORES_PARA_RETIRAR)} · te faltan {nf(SEGUIDORES_PARA_RETIRAR - seguidores)}</p>
        </div>
      ) : !abierto ? (
        <div style={{ marginTop: 18, padding: 14, borderRadius: 14, border: "1.5px dashed var(--muted)" }}>
          <b style={{ fontSize: 14 }}>Conectar cuenta bancaria</b>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>Los retiros se abren muy pronto. Lo que ganas se guarda en tu saldo y te avisaremos para que conectes tu banco.</p>
        </div>
      ) : !banco ? <Cargando /> : banco.lista ? (
        <>
          <p style={{ marginTop: 18, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: "var(--verde)" }}><Ic n="check" /></span> Cuenta bancaria conectada con Stripe</p>
          <button className={`btn ${disp >= RETIRO_MINIMO && !ocupado ? "grad" : "off"}`} style={{ marginTop: 12 }} disabled={disp < RETIRO_MINIMO || ocupado} onClick={retirar}>
            {ocupado ? "Enviando…" : disp >= RETIRO_MINIMO ? `Retirar ${dinero(Math.max(0, disp - com))}` : "Necesitas $15 para retirar"}
          </button>
          <button style={{ display: "block", margin: "12px auto 0", fontSize: 13, fontWeight: 700, color: "var(--rosa)" }} onClick={conectar} disabled={ocupado}>Cambiar mis datos bancarios</button>
        </>
      ) : (
        <div style={{ marginTop: 18, padding: 14, borderRadius: 14, background: "var(--surface2)" }}>
          <b style={{ fontSize: 14 }}>{banco.conectada ? "Termina de conectar tu banco" : "Conecta tu cuenta bancaria"}</b>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            {banco.conectada
              ? "Stripe todavía necesita algunos datos tuyos para poder enviarte dinero."
              : "Te llevamos a Stripe, que verifica tu identidad y guarda tu banco de forma segura. Blurry nunca ve tus datos bancarios."}
          </p>
          {!banco.conectada && (
            <div className="field" style={{ marginTop: 12 }}>
              <select value={pais} onChange={(e) => setPais(e.target.value)} aria-label="País de tu cuenta bancaria">
                {PAISES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
            </div>
          )}
          <button className={`btn ${ocupado ? "off" : "grad"}`} style={{ marginTop: 12 }} disabled={ocupado} onClick={conectar}>
            {ocupado ? "Abriendo Stripe…" : banco.conectada ? "Continuar en Stripe" : "Conectar con Stripe"}
          </button>
        </div>
      )}
    </>
  );
}
