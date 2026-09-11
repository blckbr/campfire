export type CampfireThemeId =
  | "black-piano-glow"
  | "silver-glow"
  | "emerald-glow"
  | "blood-red-glow"
  | "topaz-glow"
  | "white-marshmallow-glow"
  | "toasted-marshmallow-glow"
  | "color-marshmallow-glow"
  | "electric-sapphire"
  | "neon-amethyst"
  | "onyx-glow"
  | "royal-ruby"
  | "golden-amber"
  | "jade-frost"
  | "lunar-pearl"
  | "copper-lux"
  | "blue-obsidian"
  | "crystal-rose"
  | "polar-ice"
  | "lavender-dream"
  | "caramel-glow"
  | "pink-marshmallow"
  | "night-marshmallow";

export type CampfireThemeDefinition = {
  id: CampfireThemeId;
  name: string;
  description: string;
  accent: string;
  preview: string;
  texture: string;
  thumbnail: string;
};

export const CAMPFIRE_THEME_CHANGED_EVENT = "campfire-theme-change";
export const DEFAULT_CAMPFIRE_THEME: CampfireThemeId = "black-piano-glow";

export const CAMPFIRE_THEMES: readonly CampfireThemeDefinition[] = [
  { id: "black-piano-glow", name: "Black Piano", description: "Laca preta de piano, profunda, polida e espelhada.", accent: "#f1f1f4", preview: "#111216", texture: new URL("./assets/theme-backgrounds-uhd/black-piano-glow.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/black-piano-glow.webp", import.meta.url).href },
  { id: "silver-glow", name: "Silver", description: "Metal prateado polido, frio, refletivo e sofisticado.", accent: "#cbd3dc", preview: "#24282d", texture: new URL("./assets/theme-backgrounds-uhd/silver-glow.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/silver-glow.webp", import.meta.url).href },
  { id: "emerald-glow", name: "Esmeralda", description: "Gema esmeralda facetada, translúcida e com brilho interno.", accent: "#42e39b", preview: "#09251c", texture: new URL("./assets/theme-backgrounds-uhd/emerald-glow.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/emerald-glow.webp", import.meta.url).href },
  { id: "blood-red-glow", name: "Vermelho Sangue", description: "Vidro vermelho líquido, intenso, profundo e luminoso.", accent: "#ff455a", preview: "#2a090d", texture: new URL("./assets/theme-backgrounds-uhd/blood-red-glow.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/blood-red-glow.webp", import.meta.url).href },
  { id: "topaz-glow", name: "Topázio", description: "Cristal topázio âmbar-dourado, facetado e de brilho quente.", accent: "#ffba59", preview: "#2b1a08", texture: new URL("./assets/theme-backgrounds-uhd/topaz-glow.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/topaz-glow.webp", import.meta.url).href },
  { id: "white-marshmallow-glow", name: "Branco Marshmallow", description: "Marshmallows brancos reais, fofos, cremosos e levemente açucarados.", accent: "#fff9f4", preview: "#ded8d2", texture: new URL("./assets/theme-backgrounds-uhd/white-marshmallow-glow.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/white-marshmallow-glow.webp", import.meta.url).href },
  { id: "toasted-marshmallow-glow", name: "Marshmallow Levemente Tostado", description: "Marshmallows macios com superfície dourada e caramelização leve.", accent: "#e6ad7d", preview: "#2b1b12", texture: new URL("./assets/theme-backgrounds-uhd/toasted-marshmallow-glow.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/toasted-marshmallow-glow.webp", import.meta.url).href },
  { id: "color-marshmallow-glow", name: "Marshmallow Colorido", description: "Marshmallows reais em rosa, azul, amarelo e branco, macios e pastel.", accent: "#ff8bd7", preview: "#18142c", texture: new URL("./assets/theme-backgrounds-uhd/color-marshmallow-glow.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/color-marshmallow-glow.webp", import.meta.url).href },
  { id: "electric-sapphire", name: "Safira", description: "Gema safira azul profunda, cristalina, facetada e elétrica.", accent: "#3f8cff", preview: "#081730", texture: new URL("./assets/theme-backgrounds-uhd/electric-sapphire.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/electric-sapphire.webp", import.meta.url).href },
  { id: "neon-amethyst", name: "Ametista Neon", description: "Ametista violeta cristalina com brilho neon elegante.", accent: "#aa68ff", preview: "#1d0d31", texture: new URL("./assets/theme-backgrounds-uhd/neon-amethyst.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/neon-amethyst.webp", import.meta.url).href },
  { id: "onyx-glow", name: "Ônix", description: "Pedra ônix negra polida, densa, lisa e de brilho frio.", accent: "#777f91", preview: "#090a0c", texture: new URL("./assets/theme-backgrounds-uhd/onyx-glow.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/onyx-glow.webp", import.meta.url).href },
  { id: "royal-ruby", name: "Rubi Real", description: "Rubi vermelho nobre, facetado, translúcido e de brilho intenso.", accent: "#e9416c", preview: "#2a0813", texture: new URL("./assets/theme-backgrounds-uhd/royal-ruby.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/royal-ruby.webp", import.meta.url).href },
  { id: "golden-amber", name: "Âmbar Dourado", description: "Âmbar mel-dourado translúcido, quente e luminoso.", accent: "#f3a83d", preview: "#2a1907", texture: new URL("./assets/theme-backgrounds-uhd/golden-amber.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/golden-amber.webp", import.meta.url).href },
  { id: "jade-frost", name: "Jade Frost", description: "Jade verde-gelo leitoso, translúcido, frio e sereno.", accent: "#7de3c1", preview: "#09231f", texture: new URL("./assets/theme-backgrounds-uhd/jade-frost.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/jade-frost.webp", import.meta.url).href },
  { id: "lunar-pearl", name: "Pérola Lunar", description: "Pérola nacarada clara, iridescente, acetinada e com reflexo lunar.", accent: "#e8e6ff", preview: "#1a1a2b", texture: new URL("./assets/theme-backgrounds-uhd/lunar-pearl.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/lunar-pearl.webp", import.meta.url).href },
  { id: "copper-lux", name: "Cobre Lux", description: "Cobre metálico polido, quente, refinado e altamente refletivo.", accent: "#d9824f", preview: "#2a140c", texture: new URL("./assets/theme-backgrounds-uhd/copper-lux.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/copper-lux.webp", import.meta.url).href },
  { id: "blue-obsidian", name: "Obsidiana Azul", description: "Obsidiana negra vítrea com reflexos azuis profundos.", accent: "#4f79c9", preview: "#080e1d", texture: new URL("./assets/theme-backgrounds-uhd/blue-obsidian.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/blue-obsidian.webp", import.meta.url).href },
  { id: "crystal-rose", name: "Rosé Cristal", description: "Cristal rosé transparente, facetado, delicado e premium.", accent: "#ffa1bb", preview: "#29131a", texture: new URL("./assets/theme-backgrounds-uhd/crystal-rose.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/crystal-rose.webp", import.meta.url).href },
  { id: "polar-ice", name: "Gelo Polar", description: "Gelo cristalino azul-claro, translúcido, limpo e cortante.", accent: "#8fe7ff", preview: "#071c25", texture: new URL("./assets/theme-backgrounds-uhd/polar-ice.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/polar-ice.webp", import.meta.url).href },
  { id: "lavender-dream", name: "Lavanda Dream", description: "Cristal lavanda etéreo, luminoso, delicado e sonhador.", accent: "#c5a3ff", preview: "#21172d", texture: new URL("./assets/theme-backgrounds-uhd/lavender-dream.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/lavender-dream.webp", import.meta.url).href },
  { id: "caramel-glow", name: "Caramelo Glow", description: "Caramelo dourado derretido, sedoso, brilhante e apetitoso.", accent: "#d99b5d", preview: "#29190c", texture: new URL("./assets/theme-backgrounds-uhd/caramel-glow.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/caramel-glow.webp", import.meta.url).href },
  { id: "pink-marshmallow", name: "Marshmallow Rosa", description: "Marshmallows rosa reais, macios, fofos e açucarados.", accent: "#ff9fc9", preview: "#2c1522", texture: new URL("./assets/theme-backgrounds-uhd/pink-marshmallow.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/pink-marshmallow.webp", import.meta.url).href },
  { id: "night-marshmallow", name: "Marshmallow Noturno", description: "Marshmallows em azul-noturno e índigo, macios, brilhantes e acolhedores.", accent: "#7c8ef7", preview: "#0d1026", texture: new URL("./assets/theme-backgrounds-uhd/night-marshmallow.webp", import.meta.url).href, thumbnail: new URL("./assets/theme-previews/night-marshmallow.webp", import.meta.url).href },
] as const;

const THEME_IDS = new Set<CampfireThemeId>(CAMPFIRE_THEMES.map((theme) => theme.id));

function normalizeTheme(value: string | null): CampfireThemeId | null {
  return value && THEME_IDS.has(value as CampfireThemeId) ? (value as CampfireThemeId) : null;
}

function globalThemeKey(userId: string): string {
  return `campfire.theme.global.${userId}`;
}

function campfireThemeKey(userId: string, campfireId: string): string {
  return `campfire.theme.campfire.${userId}.${campfireId}`;
}

function emitThemeChanged(userId: string, campfireId: string | null) {
  window.dispatchEvent(new CustomEvent(CAMPFIRE_THEME_CHANGED_EVENT, {
    detail: { userId, campfireId },
  }));
}

export function loadGlobalCampfireTheme(userId: string): CampfireThemeId {
  try { return normalizeTheme(localStorage.getItem(globalThemeKey(userId))) ?? DEFAULT_CAMPFIRE_THEME; }
  catch { return DEFAULT_CAMPFIRE_THEME; }
}

export function saveGlobalCampfireTheme(userId: string, themeId: CampfireThemeId): CampfireThemeId {
  const normalized = normalizeTheme(themeId) ?? DEFAULT_CAMPFIRE_THEME;
  try { localStorage.setItem(globalThemeKey(userId), normalized); } catch { /* local preference */ }
  emitThemeChanged(userId, null);
  return normalized;
}

export function loadCampfireThemeOverride(userId: string, campfireId: string): CampfireThemeId | null {
  try { return normalizeTheme(localStorage.getItem(campfireThemeKey(userId, campfireId))); }
  catch { return null; }
}

export function saveCampfireThemeOverride(
  userId: string,
  campfireId: string,
  themeId: CampfireThemeId | null
): CampfireThemeId | null {
  const normalized = themeId ? normalizeTheme(themeId) : null;
  try {
    if (normalized) localStorage.setItem(campfireThemeKey(userId, campfireId), normalized);
    else localStorage.removeItem(campfireThemeKey(userId, campfireId));
  } catch { /* local preference */ }
  emitThemeChanged(userId, campfireId);
  return normalized;
}

export function resolveCampfireTheme(userId: string, campfireId: string | null): CampfireThemeId {
  if (campfireId) {
    const override = loadCampfireThemeOverride(userId, campfireId);
    if (override) return override;
  }
  return loadGlobalCampfireTheme(userId);
}

export function campfireThemeDefinition(themeId: CampfireThemeId): CampfireThemeDefinition {
  return CAMPFIRE_THEMES.find((theme) => theme.id === themeId) ?? CAMPFIRE_THEMES[0];
}
