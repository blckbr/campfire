import React from "react";
import ReactDOM from "react-dom/client";
import "./CampfireTypography.css";
import "./MarshMallowTheme.css";
import "./CampfireThemes.css";
import { registerCampfirePwa } from "./web/pwa";

const rootElement = document.getElementById("root") as HTMLElement | null;
if (!rootElement) {
  throw new Error("Elemento #root do Campfire nao foi encontrado.");
}

const root = ReactDOM.createRoot(rootElement);

function renderBootstrapError(title: string, detail: string) {
  root.render(
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px",
        boxSizing: "border-box",
        background: "#05090d",
        color: "#f3f6f8",
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      <section
        style={{
          width: "min(620px, 100%)",
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: "18px",
          padding: "28px",
          background: "#0b1117",
          boxShadow: "0 24px 70px rgba(0,0,0,.45)",
        }}
      >
        <div style={{ fontSize: "28px", marginBottom: "12px" }}>🔥</div>
        <h1 style={{ margin: "0 0 10px", fontSize: "22px" }}>{title}</h1>
        <p style={{ margin: 0, color: "#aeb8c2", lineHeight: 1.55 }}>{detail}</p>
      </section>
    </div>,
  );
}

async function bootstrap() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    renderBootstrapError(
      "CampfireWeb não configurado",
      "A publicação foi gerada sem a configuração pública do Supabase. Gere e publique novamente o CampfireWeb com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
    return;
  }

  try {
    const { default: App } = await import("./App");
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
    void registerCampfirePwa();
  } catch (error) {
    console.error("Falha ao iniciar CampfireWeb:", error);
    renderBootstrapError(
      "CampfireWeb não conseguiu iniciar",
      "A aplicação encontrou uma falha durante a inicialização. Recarregue a página; se persistir, valide a publicação e o console do navegador.",
    );
  }
}

void bootstrap();
