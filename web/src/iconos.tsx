import { P } from "./iconos-datos";

/** Icono del prototipo. Los trazos son estáticos (no vienen del usuario). */
export function Ic({ n, lleno = false }: { n: string; lleno?: boolean }) {
  return (
    <svg
      className="ico"
      viewBox="0 0 24 24"
      fill={lleno ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={lleno ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: P[n] }}
    />
  );
}
