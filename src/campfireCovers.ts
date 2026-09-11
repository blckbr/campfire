import { supabase } from "./lib/supabase";
import type { CampfireCoverKind } from "./useCampfires";

export type CampfireCoverPreset = {
  id: string;
  name: string;
  url: string;
};

export type CampfireCoverSelection = {
  kind: CampfireCoverKind;
  ref: string;
  previewUrl: string;
};

export const CAMPFIRE_COVER_PRESETS: readonly CampfireCoverPreset[] = [
  { id: "cinema-night", name: "Noite de Cinema", url: "./campfire-covers/cinema-room.webp" },
  { id: "forest-fire", name: "Fogueira no Lago", url: "./campfire-covers/campfire-lake.webp" },
  { id: "neon-city", name: "Cidade Neon", url: "./campfire-covers/tech-neon.webp" },
  { id: "fantasy-moon", name: "Horizonte Fantasia", url: "./campfire-covers/anime-sunset.webp" },
  { id: "music-vinyl", name: "Black Piano", url: "./campfire-covers/black-piano.webp" },
  { id: "gaming-desk", name: "Setup Gamer", url: "./campfire-covers/gaming-neon.webp" },
  { id: "aurora", name: "Céu Boreal", url: "./campfire-covers/aurora-sky.webp" },
  { id: "marshmallow", name: "Montanhas & Histórias", url: "./campfire-covers/travel-mountain.webp" },
] as const;

const ALLOWED_COVER_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_COVER_BYTES = 8 * 1024 * 1024;
const COVER_BUCKET = "campfire-covers";

function fileExtension(file: File): string {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return byMime[file.type] ?? "img";
}

export function getCampfireCoverPreset(id: string): CampfireCoverPreset {
  return CAMPFIRE_COVER_PRESETS.find((preset) => preset.id === id) ?? CAMPFIRE_COVER_PRESETS[0];
}

export function validateRemoteCoverUrl(value: string): string {
  const clean = value.trim();
  if (!clean) throw new Error("Cole uma URL de imagem.");

  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    throw new Error("A URL da capa é inválida.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("A capa da web precisa usar http:// ou https://.");
  }

  if (clean.length > 2048) {
    throw new Error("A URL da capa é longa demais.");
  }

  return parsed.toString();
}

export async function uploadCampfireCover(
  userId: string,
  file: File
): Promise<CampfireCoverSelection> {
  if (!userId) throw new Error("Entre na sua conta antes de enviar uma capa.");
  if (!ALLOWED_COVER_MIME.has(file.type)) {
    throw new Error("Use uma imagem JPG, PNG, WebP ou GIF.");
  }
  if (file.size <= 0 || file.size > MAX_COVER_BYTES) {
    throw new Error("A imagem da capa deve ter no máximo 8 MB.");
  }

  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${userId}/${id}.${fileExtension(file)}`;

  const { error } = await supabase.storage
    .from(COVER_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(COVER_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("O Supabase não retornou a URL pública da capa.");

  return {
    kind: "storage",
    ref: path,
    previewUrl: data.publicUrl,
  };
}

export function resolveCampfireCoverUrl(
  kind: CampfireCoverKind,
  ref: string
): string {
  if (kind === "preset") return getCampfireCoverPreset(ref).url;
  if (kind === "web") {
    try { return validateRemoteCoverUrl(ref); }
    catch { return getCampfireCoverPreset("cinema-night").url; }
  }

  const { data } = supabase.storage.from(COVER_BUCKET).getPublicUrl(ref);
  return data.publicUrl || getCampfireCoverPreset("cinema-night").url;
}
