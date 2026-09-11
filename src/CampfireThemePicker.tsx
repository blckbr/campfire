import { CAMPFIRE_THEMES, type CampfireThemeId } from "./campfireThemes";
import "./CampfireThemePicker.css";

type Props = {
  value: CampfireThemeId | null;
  allowInherited?: boolean;
  inheritedLabel?: string;
  onChange: (themeId: CampfireThemeId | null) => void;
};

export default function CampfireThemePicker({
  value,
  allowInherited = false,
  inheritedLabel = "Usar tema global",
  onChange,
}: Props) {
  return (
    <div className="campfireThemePicker" role="radiogroup" aria-label="Tema visual do Campfire">
      {allowInherited && (
        <button type="button" className={value === null ? "selected inherited" : "inherited"} onClick={() => onChange(null)}>
          <span className="campfireThemeCardPreview inheritedPreview" aria-hidden="true">↩</span>
          <span className="campfireThemeCardCopy"><strong>{inheritedLabel}</strong><small>Usa o material definido para toda a conta.</small></span>
        </button>
      )}
      {CAMPFIRE_THEMES.map((theme) => (
        <button
          key={theme.id}
          type="button"
          role="radio"
          aria-checked={value === theme.id}
          className={value === theme.id ? "selected" : ""}
          onClick={() => onChange(theme.id)}
          title={`${theme.name} — ${theme.description}`}
        >
          <span
            className="campfireThemeCardPreview"
            aria-hidden="true"
            data-theme-preview={theme.id}
            style={{ backgroundImage: `url("${theme.thumbnail}")` }}
          />
          <span className="campfireThemeCardCopy">
            <strong>{theme.name}</strong>
            <small>{theme.description}</small>
          </span>
          <i className="campfireThemeCardCheck" aria-hidden="true">{value === theme.id ? "✓" : ""}</i>
        </button>
      ))}
    </div>
  );
}
