import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const baselinePath = path.join(ROOT, "release-baseline", "r6.6.6.15.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));

function arg(name, fallback = "") {
  const at = process.argv.indexOf(name);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const archivesDir = path.resolve(arg("--archives-dir", path.join(ROOT, "..", "audit-campfire")));
const target = path.resolve(arg("--target", path.join(ROOT, "..", "campfire-r66615-reconstructed")));
const finalOverride = arg("--final", "");
const voiceCoreOverride = arg("--voice-core", path.join(ROOT, "..", "Campfire-GameVox-Voice-Core-R1.zip"));

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function archivePath(name) {
  if (name === baseline.finalArchive && finalOverride) return path.resolve(finalOverride);
  if (name === "Campfire-GameVox-Voice-Core-R1.zip" && fs.existsSync(voiceCoreOverride)) return path.resolve(voiceCoreOverride);
  const candidate = path.join(archivesDir, name);
  if (fs.existsSync(candidate)) return candidate;
  const besideArchives = path.join(path.dirname(archivesDir), name);
  if (fs.existsSync(besideArchives)) return besideArchives;
  throw new Error(`Missing required archive: ${name}`);
}

function extractZip(zipFile) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "campfire-r66615-"));
  if (process.platform === "win32") {
    const command = `Expand-Archive -LiteralPath '${zipFile.replaceAll("'", "''")}' -DestinationPath '${dir.replaceAll("'", "''")}' -Force`;
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`Expand-Archive failed for ${zipFile}: ${result.stderr || result.stdout}`);
  } else {
    const result = spawnSync("unzip", ["-qq", "-o", zipFile, "-d", dir], { encoding: "utf8" });
    // Info-ZIP returns 1 for the harmless "backslashes as path separators" warning.
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`unzip failed for ${zipFile}: ${result.stderr || result.stdout}`);
    }
  }
  return dir;
}

function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function safeCopy(source, relative) {
  const normalized = relative.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").includes("..")) throw new Error(`Unsafe overlay path: ${relative}`);
  const destination = path.join(target, ...normalized.split("/"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function overlayArchive(name, mode = "payload", options = {}) {
  const zipFile = archivePath(name);
  const extracted = extractZip(zipFile);
  let copied = 0;
  try {
    for (const source of listFiles(extracted)) {
      const rel = path.relative(extracted, source).replaceAll("\\", "/");
      let output = null;
      if (mode === "all") output = rel;
      else if (mode === "payload") {
        const marker = "/payload/";
        const padded = `/${rel}`;
        const at = padded.indexOf(marker);
        if (at >= 0) output = padded.slice(at + marker.length);
      } else if (mode === "strip-root") {
        const root = `${options.root || ""}/`;
        if (rel.startsWith(root)) output = rel.slice(root.length);
      } else if (mode === "prefix") {
        const prefix = options.prefix || "";
        if (rel.startsWith(prefix)) output = rel.slice(prefix.length);
      }
      if (!output) continue;
      safeCopy(source, output);
      copied += 1;
    }
  } finally {
    fs.rmSync(extracted, { recursive: true, force: true });
  }
  console.log(`${name}: ${copied} files`);
  return copied;
}

function copyRootFileFromArchive(name, filename) {
  const zipFile = archivePath(name);
  const extracted = extractZip(zipFile);
  try {
    const matches = listFiles(extracted).filter((source) => path.basename(source).toLowerCase() === filename.toLowerCase());
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one ${filename} in ${name}, found ${matches.length}`);
    }
    safeCopy(matches[0], filename);
  } finally {
    fs.rmSync(extracted, { recursive: true, force: true });
  }
}

function removeStaleRootLaunchers() {
  for (const filename of [
    "ABRIR_CAMPFIRE_R6_6_2.bat",
    "ABRIR_CAMPFIRE_R6_6_3.bat",
  ]) {
    fs.rmSync(path.join(target, filename), { force: true });
  }
}

function verifyFinalPayload() {
  let verified = 0;
  for (const item of baseline.finalPayloadManifest) {
    const rel = item.path.replaceAll("\\", "/");
    const file = path.join(target, ...rel.split("/"));
    if (!fs.existsSync(file)) throw new Error(`Final payload file missing after reconstruction: ${rel}`);
    const actual = sha256File(file);
    const expected = item.payloadSha256 || item.sha256;
    if (actual !== expected) throw new Error(`Final payload hash mismatch for ${rel}: ${actual} != ${expected}`);
    verified += 1;
  }
  return verified;
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });

overlayArchive(baseline.baseArchive, "all");
for (const entry of baseline.webOverlays) overlayArchive(entry.archive, entry.mode, entry);
overlayArchive(baseline.siteArchive.archive, baseline.siteArchive.mode, baseline.siteArchive);
for (const entry of baseline.carryForwardOverlays) overlayArchive(entry.archive, entry.mode, entry);
for (const name of baseline.overlays) overlayArchive(name, "payload");

const finalZip = archivePath(baseline.finalArchive);
const finalZipHash = sha256File(finalZip);
if (finalZipHash !== baseline.finalSha256) {
  throw new Error(`Final archive SHA-256 mismatch: ${finalZipHash} != ${baseline.finalSha256}`);
}
overlayArchive(baseline.finalArchive, "payload");
copyRootFileFromArchive(baseline.finalArchive, "ABRIR_CAMPFIRE_R6_6_6_15.bat");
removeStaleRootLaunchers();

const verified = verifyFinalPayload();
console.log(`R6.6.6.15 reconstruction complete: ${verified}/${baseline.finalPayloadManifest.length} final payload hashes verified.`);
console.log(`Target: ${target}`);
