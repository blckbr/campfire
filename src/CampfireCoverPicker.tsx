import { useRef, useState } from "react";
import {
  CAMPFIRE_COVER_PRESETS,
  getCampfireCoverPreset,
  uploadCampfireCover,
  validateRemoteCoverUrl,
  type CampfireCoverSelection,
} from "./campfireCovers";
import "./CampfireCoverPicker.css";

type Props = {
  userId: string;
  value: CampfireCoverSelection;
  disabled?: boolean;
  onChange: (selection: CampfireCoverSelection) => void;
};

export default function CampfireCoverPicker({
  userId,
  value,
  disabled = false,
  onChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<"preset" | "pc" | "web">("preset");
  const [webUrl, setWebUrl] = useState(value.kind === "web" ? value.ref : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function chooseFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const selection = await uploadCampfireCover(userId, file);
      onChange(selection);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Não foi possível enviar a imagem.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function applyWebUrl() {
    setError("");
    try {
      const normalized = validateRemoteCoverUrl(webUrl);
      onChange({ kind: "web", ref: normalized, previewUrl: normalized });
    } catch (urlError) {
      setError(urlError instanceof Error ? urlError.message : "URL inválida.");
    }
  }

  return (
    <section className="campfireCoverPicker" aria-label="Imagem de capa da Campfire">
      <div className="campfireCoverPreview">
        <img
          src={value.previewUrl}
          alt="Prévia da capa"
          onError={(event) => {
            event.currentTarget.src = getCampfireCoverPreset("cinema-night").url;
            setError("Não foi possível carregar essa imagem. Escolha outra capa.");
          }}
        />
        <span>Capa compartilhada com todos</span>
      </div>

      <div className="campfireCoverTabs" role="tablist" aria-label="Origem da capa">
        <button type="button" className={tab === "preset" ? "active" : ""} onClick={() => setTab("preset")}>Galeria</button>
        <button type="button" className={tab === "pc" ? "active" : ""} onClick={() => setTab("pc")}>Meu PC</button>
        <button type="button" className={tab === "web" ? "active" : ""} onClick={() => setTab("web")}>Web</button>
      </div>

      {tab === "preset" && (
        <div className="campfireCoverPresetGrid">
          {CAMPFIRE_COVER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={disabled || busy}
              className={value.kind === "preset" && value.ref === preset.id ? "selected" : ""}
              onClick={() => onChange({ kind: "preset", ref: preset.id, previewUrl: preset.url })}
            >
              <img src={preset.url} alt="" />
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
      )}

      {tab === "pc" && (
        <div className="campfireCoverUploadPane">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={disabled || busy}
            onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)}
          />
          <button type="button" disabled={disabled || busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Enviando imagem…" : "Selecionar imagem do PC"}
          </button>
          <small>JPG, PNG, WebP ou GIF • até 8 MB. A imagem é enviada ao storage compartilhado.</small>
        </div>
      )}

      {tab === "web" && (
        <div className="campfireCoverWebPane">
          <input
            type="url"
            value={webUrl}
            disabled={disabled || busy}
            placeholder="https://site.com/imagem.jpg"
            onChange={(event) => setWebUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyWebUrl();
              }
            }}
          />
          <button type="button" disabled={disabled || !webUrl.trim()} onClick={applyWebUrl}>Usar imagem da web</button>
        </div>
      )}

      {error && <p className="campfireCoverError" role="alert">{error}</p>}
    </section>
  );
}
