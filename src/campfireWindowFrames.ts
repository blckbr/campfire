export type CampfireWindowFrameId =
  | "none"
  | "black-piano"
  | "silver"
  | "emerald"
  | "blood-red"
  | "topaz"
  | "marshmallow-white"
  | "marshmallow-toasted"
  | "marshmallow-color"
  | "sapphire"
  | "amethyst"
  | "onyx"
  | "ruby"
  | "golden-amber"
  | "jade-frost"
  | "lunar-pearl"
  | "copper-lux"
  | "blue-obsidian"
  | "crystal-rose"
  | "polar-ice"
  | "lavender-dream"
  | "caramel"
  | "marshmallow-pink"
  | "marshmallow-night";

export type CampfireWindowFrame = {
  id: CampfireWindowFrameId;
  name: string;
  description: string;
  group: "none" | "marshmallow" | "gem";
  preview: string | null;
  materialTop: string | null;
  materialSide: string | null;
  glow: string;
};

export const CAMPFIRE_WINDOW_FRAME_CHANGED_EVENT = "campfire-window-frame-changed";

const topAsset = (name: string) => new URL(`./assets/window-frames-uhd/${name}-top.webp`, import.meta.url).href;
const sideAsset = (name: string) => new URL(`./assets/window-frames-uhd/${name}-side.webp`, import.meta.url).href;
const thumb = (name: string) => new URL(`./assets/window-frame-previews/${name}.webp`, import.meta.url).href;

export const CAMPFIRE_WINDOW_FRAMES: readonly CampfireWindowFrame[] = [
  { id: "none", name: "Liquid Glass", description: "Vidro translúcido real, com refração, brilho e profundidade; sem textura de moldura.", group: "none", preview: thumb("liquid-glass"), materialTop: null, materialSide: null, glow: "rgba(210,235,255,.30)" },
  { id: "marshmallow-color", name: "Marshmallow Colorido", description: "Marshmallows reais em rosa, azul, amarelo e branco, macios e pastel.", group: "marshmallow", preview: thumb("color-marshmallow-glow"), materialTop: topAsset("color-marshmallow-glow"), materialSide: sideAsset("color-marshmallow-glow"), glow: "rgba(255,139,215,.82)" },
  { id: "marshmallow-white", name: "Branco Marshmallow", description: "Marshmallows brancos reais, fofos, cremosos e levemente açucarados.", group: "marshmallow", preview: thumb("white-marshmallow-glow"), materialTop: topAsset("white-marshmallow-glow"), materialSide: sideAsset("white-marshmallow-glow"), glow: "rgba(255,250,245,.86)" },
  { id: "marshmallow-toasted", name: "Marshmallow Levemente Tostado", description: "Marshmallows macios com superfície dourada e caramelização leve.", group: "marshmallow", preview: thumb("toasted-marshmallow-glow"), materialTop: topAsset("toasted-marshmallow-glow"), materialSide: sideAsset("toasted-marshmallow-glow"), glow: "rgba(232,173,122,.80)" },
  { id: "marshmallow-pink", name: "Marshmallow Rosa", description: "Marshmallows rosa reais, macios, fofos e açucarados.", group: "marshmallow", preview: thumb("pink-marshmallow"), materialTop: topAsset("pink-marshmallow"), materialSide: sideAsset("pink-marshmallow"), glow: "rgba(255,159,201,.84)" },
  { id: "marshmallow-night", name: "Marshmallow Noturno", description: "Marshmallows em azul-noturno e índigo, macios e luminosos.", group: "marshmallow", preview: thumb("night-marshmallow"), materialTop: topAsset("night-marshmallow"), materialSide: sideAsset("night-marshmallow"), glow: "rgba(124,142,247,.82)" },
  { id: "black-piano", name: "Black Piano", description: "Laca preta de piano, profunda, polida e espelhada.", group: "gem", preview: thumb("black-piano-glow"), materialTop: topAsset("black-piano-glow"), materialSide: sideAsset("black-piano-glow"), glow: "rgba(235,240,255,.52)" },
  { id: "silver", name: "Silver", description: "Metal prateado polido, frio, refletivo e sofisticado.", group: "gem", preview: thumb("silver-glow"), materialTop: topAsset("silver-glow"), materialSide: sideAsset("silver-glow"), glow: "rgba(203,211,220,.84)" },
  { id: "emerald", name: "Esmeralda", description: "Gema esmeralda facetada, translúcida e com brilho interno.", group: "gem", preview: thumb("emerald-glow"), materialTop: topAsset("emerald-glow"), materialSide: sideAsset("emerald-glow"), glow: "rgba(66,227,155,.84)" },
  { id: "blood-red", name: "Vermelho Sangue", description: "Vidro vermelho líquido, intenso, profundo e luminoso.", group: "gem", preview: thumb("blood-red-glow"), materialTop: topAsset("blood-red-glow"), materialSide: sideAsset("blood-red-glow"), glow: "rgba(255,69,90,.88)" },
  { id: "topaz", name: "Topázio", description: "Cristal topázio âmbar-dourado, facetado e de brilho quente.", group: "gem", preview: thumb("topaz-glow"), materialTop: topAsset("topaz-glow"), materialSide: sideAsset("topaz-glow"), glow: "rgba(255,186,89,.86)" },
  { id: "sapphire", name: "Safira", description: "Gema safira azul profunda, cristalina, facetada e elétrica.", group: "gem", preview: thumb("electric-sapphire"), materialTop: topAsset("electric-sapphire"), materialSide: sideAsset("electric-sapphire"), glow: "rgba(63,140,255,.88)" },
  { id: "amethyst", name: "Ametista Neon", description: "Ametista violeta cristalina com brilho neon elegante.", group: "gem", preview: thumb("neon-amethyst"), materialTop: topAsset("neon-amethyst"), materialSide: sideAsset("neon-amethyst"), glow: "rgba(170,104,255,.88)" },
  { id: "onyx", name: "Ônix", description: "Pedra ônix negra polida, densa, lisa e de brilho frio.", group: "gem", preview: thumb("onyx-glow"), materialTop: topAsset("onyx-glow"), materialSide: sideAsset("onyx-glow"), glow: "rgba(119,127,145,.72)" },
  { id: "ruby", name: "Rubi Real", description: "Rubi vermelho nobre, facetado, translúcido e de brilho intenso.", group: "gem", preview: thumb("royal-ruby"), materialTop: topAsset("royal-ruby"), materialSide: sideAsset("royal-ruby"), glow: "rgba(233,65,108,.88)" },
  { id: "golden-amber", name: "Âmbar Dourado", description: "Âmbar mel-dourado translúcido, quente e luminoso.", group: "gem", preview: thumb("golden-amber"), materialTop: topAsset("golden-amber"), materialSide: sideAsset("golden-amber"), glow: "rgba(243,168,61,.88)" },
  { id: "jade-frost", name: "Jade Frost", description: "Jade verde-gelo leitoso, translúcido, frio e sereno.", group: "gem", preview: thumb("jade-frost"), materialTop: topAsset("jade-frost"), materialSide: sideAsset("jade-frost"), glow: "rgba(125,227,193,.84)" },
  { id: "lunar-pearl", name: "Pérola Lunar", description: "Pérola nacarada clara, iridescente, acetinada e com reflexo lunar.", group: "gem", preview: thumb("lunar-pearl"), materialTop: topAsset("lunar-pearl"), materialSide: sideAsset("lunar-pearl"), glow: "rgba(232,230,255,.82)" },
  { id: "copper-lux", name: "Cobre Lux", description: "Cobre metálico polido, quente, refinado e altamente refletivo.", group: "gem", preview: thumb("copper-lux"), materialTop: topAsset("copper-lux"), materialSide: sideAsset("copper-lux"), glow: "rgba(217,130,79,.84)" },
  { id: "blue-obsidian", name: "Obsidiana Azul", description: "Obsidiana negra vítrea com reflexos azuis profundos.", group: "gem", preview: thumb("blue-obsidian"), materialTop: topAsset("blue-obsidian"), materialSide: sideAsset("blue-obsidian"), glow: "rgba(79,121,201,.84)" },
  { id: "crystal-rose", name: "Rosé Cristal", description: "Cristal rosé transparente, facetado, delicado e premium.", group: "gem", preview: thumb("crystal-rose"), materialTop: topAsset("crystal-rose"), materialSide: sideAsset("crystal-rose"), glow: "rgba(255,161,187,.86)" },
  { id: "polar-ice", name: "Gelo Polar", description: "Gelo cristalino azul-claro, translúcido, limpo e cortante.", group: "gem", preview: thumb("polar-ice"), materialTop: topAsset("polar-ice"), materialSide: sideAsset("polar-ice"), glow: "rgba(143,231,255,.88)" },
  { id: "lavender-dream", name: "Lavanda Dream", description: "Cristal lavanda etéreo, luminoso, delicado e sonhador.", group: "gem", preview: thumb("lavender-dream"), materialTop: topAsset("lavender-dream"), materialSide: sideAsset("lavender-dream"), glow: "rgba(197,163,255,.86)" },
  { id: "caramel", name: "Caramelo Glow", description: "Caramelo dourado derretido, sedoso, brilhante e apetitoso.", group: "gem", preview: thumb("caramel-glow"), materialTop: topAsset("caramel-glow"), materialSide: sideAsset("caramel-glow"), glow: "rgba(217,155,93,.82)" },
] as const;

const DEFAULT_FRAME: CampfireWindowFrameId = "none";
function storageKey(userId: string): string { return `campfire.windowFrame.${userId}`; }
export function isCampfireWindowFrameId(value: string | null): value is CampfireWindowFrameId { return CAMPFIRE_WINDOW_FRAMES.some((frame) => frame.id === value); }
export function getCampfireWindowFrame(frameId: CampfireWindowFrameId): CampfireWindowFrame { return CAMPFIRE_WINDOW_FRAMES.find((frame) => frame.id === frameId) ?? CAMPFIRE_WINDOW_FRAMES[0]; }
export function loadCampfireWindowFrame(userId: string): CampfireWindowFrameId { try { const saved = localStorage.getItem(storageKey(userId)); return isCampfireWindowFrameId(saved) ? saved : DEFAULT_FRAME; } catch { return DEFAULT_FRAME; } }
export function saveCampfireWindowFrame(userId: string, frameId: CampfireWindowFrameId): CampfireWindowFrameId { try { localStorage.setItem(storageKey(userId), frameId); } catch {} window.dispatchEvent(new CustomEvent(CAMPFIRE_WINDOW_FRAME_CHANGED_EVENT,{detail:{userId,frameId}})); return frameId; }
