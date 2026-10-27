import { useEffect, useState } from "react";
import { collection, documentId, getCountFromServer, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { Barra, Cargando, TituloHoja } from "../componentes";
import { db } from "../firebase";
import { useNav } from "../nav";
import { diaDe, nf } from "../util";

// Contadores diarios que escribe Functions (functions/src/estadisticas.ts).
type Dia = { id: string } & Partial<Record<Campo, number>>;
type Campo = (typeof CAMPOS)[number][0];

const CAMPOS = [
  ["activos", "Usuarios activos"],
  ["registros", "Cuentas nuevas"],
  ["intentos", "Preguntas jugadas"],
  ["aciertos", "Aciertos"],
  ["pagos", "Fotos pagadas"],
  ["monedasGastadas", "Monedas gastadas"],
  ["publicaciones", "Publicaciones aprobadas"],
  ["reels", "Reels publicados"],
  ["comentarios", "Comentarios"],
  ["seguimientos", "Seguimientos nuevos"],
  ["referidos", "Amigos invitados que jugaron"],
  ["compartidos", "Veces que se compartió"],
  ["visitasDescarga", "Visitas a la página de descarga"],
  ["descargasApk", "Descargas del APK"],
  ["instalaciones", "Instalaciones como app"],
] as const;

const DIAS = 30;

/** Los últimos `n` días (AAAA-MM-DD, hora de Nueva York), del más antiguo al de hoy. */
function ultimosDias(n: number): string[] {
  const hoy = Date.now();
  return Array.from({ length: n }, (_, i) => diaDe(new Date(hoy - (n - 1 - i) * 86_400_000)));
}

const suma = (dias: Dia[], c: Campo) => dias.reduce((t, d) => t + (d[c] ?? 0), 0);
const corto = (dia: string) => { const [, m, d] = dia.split("-"); return `${+d}/${+m}`; };

/** Panel de estadísticas de uso. Solo lo ve (y lo puede leer) el administrador. */
export function Estadisticas() {
  const { abrirHoja } = useNav();
  const [dias, setDias] = useState<Dia[] | null>(null);
  const [totales, setTotales] = useState<{ usuarios: number; creadores: number; fotos: number; reels: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const rango = ultimosDias(DIAS);
    getDocs(query(collection(db, "estadisticas"), where(documentId(), ">=", rango[0]), orderBy(documentId()), limit(DIAS + 2)))
      .then((s) => {
        const porDia = new Map(s.docs.map((d) => [d.id, d.data() as Dia]));
        setDias(rango.map((id) => ({ ...porDia.get(id), id })));
      }, (e) => setError(String(e?.message ?? e)));
    const cuenta = (q: Parameters<typeof getCountFromServer>[0]) => getCountFromServer(q).then((r) => r.data().count, () => 0);
    Promise.all([
      cuenta(collection(db, "users")),
      cuenta(query(collection(db, "users"), where("esCreador", "==", true))),
      cuenta(query(collection(db, "posts"), where("estado", "==", "aprobada"), where("oculta", "==", false))),
      cuenta(query(collection(db, "reels"), where("estado", "==", "publicado"))),
    ]).then(([usuarios, creadores, fotos, reels]) => setTotales({ usuarios, creadores, fotos, reels }));
  }, []);

  if (error) return <><Barra titulo="Estadísticas" /><p className="sub" style={{ padding: 20 }}>No se pudieron cargar: {error}</p></>;
  if (!dias) return <><Barra titulo="Estadísticas" /><Cargando /></>;

  const hoy = dias[dias.length - 1];
  const sem = dias.slice(-7);
  const semAnt = dias.slice(-14, -7);
  const tasa = suma(sem, "intentos") ? Math.round((suma(sem, "aciertos") / suma(sem, "intentos")) * 100) : null;

  return (
    <>
      <Barra titulo="Estadísticas" />
      <p className="sub" style={{ margin: "0 2px 12px" }}>Días en hora de Nueva York. Se cuenta desde que se activó el panel.</p>

      {totales && (
        <div className="stats-tiles">
          <Tile titulo="Usuarios" valor={totales.usuarios} />
          <Tile titulo="Creadores" valor={totales.creadores} />
          <Tile titulo="Fotos visibles" valor={totales.fotos} />
          <Tile titulo="Reels" valor={totales.reels} />
        </div>
      )}

      <p className="lbl">Hoy</p>
      <div className="stats-tiles">
        <Tile titulo="Activos" valor={hoy.activos ?? 0} />
        <Tile titulo="Cuentas nuevas" valor={hoy.registros ?? 0} />
        <Tile titulo="Preguntas jugadas" valor={hoy.intentos ?? 0} />
        <Tile titulo="Compartido" valor={hoy.compartidos ?? 0} />
      </div>

      <p className="lbl">Últimos 7 días</p>
      <div className="stats-tiles">
        <Tile titulo="Activos (suma diaria)" valor={suma(sem, "activos")} antes={suma(semAnt, "activos")} />
        <Tile titulo="Cuentas nuevas" valor={suma(sem, "registros")} antes={suma(semAnt, "registros")} />
        <Tile titulo="Amigos invitados" valor={suma(sem, "referidos")} antes={suma(semAnt, "referidos")} />
        <Tile titulo="Aciertan" texto={tasa === null ? "—" : `${tasa}%`} />
      </div>

      <Grafica titulo="Usuarios activos por día" dias={dias} campo="activos" />
      <Grafica titulo="Cuentas nuevas por día" dias={dias} campo="registros" />
      <Grafica titulo="Preguntas jugadas por día" dias={dias} campo="intentos" />
      <Grafica titulo="Visitas a la página de descarga" dias={dias} campo="visitasDescarga" />

      <button className="btn soft" style={{ marginTop: 18 }} onClick={() => abrirHoja(<TablaEstadisticas dias={dias} />)}>Ver todos los datos por día</button>
    </>
  );
}

function Tile({ titulo, valor, antes, texto }: { titulo: string; valor?: number; antes?: number; texto?: string }) {
  const cambio = valor !== undefined && antes !== undefined && antes > 0 ? Math.round(((valor - antes) / antes) * 100) : null;
  return (
    <div className="stats-tile">
      <small>{titulo}</small>
      <b>{texto ?? nf(valor ?? 0)}</b>
      {cambio !== null && (
        <span style={{ color: cambio >= 0 ? "var(--verde)" : "var(--rojo)" }}>{cambio >= 0 ? "▲" : "▼"} {Math.abs(cambio)}% vs. 7 días antes</span>
      )}
    </div>
  );
}

/** Barras diarias de una sola serie; al tocar o pasar por una barra se ve su día y su valor. */
function Grafica({ titulo, dias, campo }: { titulo: string; dias: Dia[]; campo: Campo }) {
  const [sel, setSel] = useState<number | null>(null);
  const valores = dias.map((d) => d[campo] ?? 0);
  const max = Math.max(1, ...valores);
  const i = sel ?? valores.length - 1;
  return (
    <figure className="stats-grafica">
      <figcaption>
        <span>{titulo}</span>
        <span className="stats-valor">{corto(dias[i].id)} · <b>{nf(valores[i])}</b></span>
      </figcaption>
      <div className="stats-barras" onMouseLeave={() => setSel(null)} role="img" aria-label={`${titulo}: últimos ${dias.length} días, máximo ${max}`}>
        {valores.map((v, k) => (
          <button key={dias[k].id} className={`stats-col ${k === i ? "on" : ""}`} onMouseEnter={() => setSel(k)} onFocus={() => setSel(k)} onClick={() => setSel(k)}
            aria-label={`${corto(dias[k].id)}: ${v}`}>
            <i style={{ height: `${v ? Math.max(4, (v / max) * 100) : 0}%` }} />
          </button>
        ))}
      </div>
      <div className="stats-eje"><span>{corto(dias[0].id)}</span><span>máx. {nf(max)}</span><span>hoy</span></div>
    </figure>
  );
}

function TablaEstadisticas({ dias }: { dias: Dia[] }) {
  const filas = [...dias].reverse();
  return (
    <>
      <TituloHoja>Datos por día</TituloHoja>
      <div style={{ overflowX: "auto", margin: "0 -4px" }}>
        <table className="stats-tabla">
          <thead><tr><th>Día</th>{CAMPOS.map(([k, t]) => <th key={k}>{t}</th>)}</tr></thead>
          <tbody>
            {filas.map((d) => (
              <tr key={d.id}><td>{corto(d.id)}</td>{CAMPOS.map(([k]) => <td key={k}>{nf(d[k] ?? 0)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
