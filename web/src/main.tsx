import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./estilos.css";
import App from "./App.tsx";
import { guardarReferido } from "./util";

guardarReferido();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Permite instalar la web como app. En desarrollo no hace falta.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

