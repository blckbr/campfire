import { supabase } from "./lib/supabase";

const DB_NAME = "campfire-identity";
const STORE_NAME = "identity-keys";
const DB_VERSION = 1;

type StoredIdentityKey = {
  userId: string;
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
};

export type CampfireVerificationIdentity = {
  userId: string;
  publicKey: string;
  fingerprint: string;
  updatedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "userId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir armazenamento de identidade."));
  });
}

async function getStoredKey(userId: string): Promise<StoredIdentityKey | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(userId);
    request.onsuccess = () => resolve((request.result as StoredIdentityKey | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Falha ao ler identidade local."));
    tx.oncomplete = () => db.close();
  });
}

async function putStoredKey(value: StoredIdentityKey): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Falha ao salvar identidade local.")); };
  });
}

function stablePublicKey(jwk: JsonWebKey): string {
  return JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });
}

async function digestHex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formatFingerprint(hex: string): string {
  return hex.toUpperCase().match(/.{1,4}/g)?.join(" ") ?? hex.toUpperCase();
}

export async function ensureCampfireIdentity(userId: string): Promise<CampfireVerificationIdentity> {
  let stored = await getStoredKey(userId);
  if (!stored) {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const [privateJwk, publicJwk] = await Promise.all([
      crypto.subtle.exportKey("jwk", pair.privateKey),
      crypto.subtle.exportKey("jwk", pair.publicKey),
    ]);
    stored = { userId, privateJwk, publicJwk };
    await putStoredKey(stored);
  }

  const publicKey = stablePublicKey(stored.publicJwk);
  const fingerprint = formatFingerprint(await digestHex(publicKey));
  const { error } = await supabase.from("campfire_identity_keys").upsert({
    user_id: userId,
    public_key: publicKey,
    fingerprint,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;

  return { userId, publicKey, fingerprint, updatedAt: new Date().toISOString() };
}

export async function getRemoteCampfireIdentity(userId: string): Promise<CampfireVerificationIdentity | null> {
  const { data, error } = await supabase.from("campfire_identity_keys")
    .select("user_id,public_key,fingerprint,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    userId: String(data.user_id),
    publicKey: String(data.public_key),
    fingerprint: String(data.fingerprint),
    updatedAt: String(data.updated_at),
  };
}

export async function buildCampfireSafetyNumber(currentUserId: string, targetUserId: string): Promise<{
  code: string;
  local: CampfireVerificationIdentity;
  remote: CampfireVerificationIdentity;
}> {
  const local = await ensureCampfireIdentity(currentUserId);
  const remote = await getRemoteCampfireIdentity(targetUserId);
  if (!remote) throw new Error("A outra pessoa ainda não publicou a chave de identidade. Peça para ela abrir o Campfire atualizado uma vez.");
  const rows = [local, remote].sort((a, b) => a.userId.localeCompare(b.userId));
  const safetyHex = await digestHex(`${rows[0].userId}|${rows[0].publicKey}|${rows[1].userId}|${rows[1].publicKey}`);
  return { code: formatFingerprint(safetyHex), local, remote };
}
