import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const platform = String(argValue("--platform", "all")).toLowerCase();
const releaseDir = path.resolve(argValue("--dir", "release"));
const writeChecksums = process.argv.includes("--write-checksums");

if (!["all", "windows", "linux"].includes(platform)) {
  console.error(`Unsupported --platform value: ${platform}`);
  process.exit(2);
}
if (!fs.existsSync(releaseDir) || !fs.statSync(releaseDir).isDirectory()) {
  console.error(`Release directory not found: ${releaseDir}`);
  process.exit(2);
}

const files = fs.readdirSync(releaseDir).filter((name) => {
  const full = path.join(releaseDir, name);
  return fs.statSync(full).isFile();
});

const required = {
  windows: [
    { label: "Windows Setup", pattern: /^Campfire-Setup-.*\.exe$/ },
    { label: "Windows Portable", pattern: /^Campfire-Portable-.*\.exe$/ },
  ],
  linux: [
    { label: "Linux RPM", pattern: /^Campfire-.*\.rpm$/ },
    { label: "Linux AppImage", pattern: /^Campfire-.*\.AppImage$/ },
  ],
};

const targets = platform === "all" ? [...required.windows, ...required.linux] : required[platform];
let failed = false;
const artifacts = [];

for (const target of targets) {
  const matches = files.filter((name) => target.pattern.test(name));
  if (matches.length !== 1) {
    console.error(`${target.label}: expected exactly 1 artifact, found ${matches.length}`);
    for (const match of matches) console.error(`  - ${match}`);
    failed = true;
    continue;
  }
  artifacts.push({ label: target.label, name: matches[0] });
}

if (failed) process.exit(1);

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

for (const artifact of artifacts) {
  const artifactPath = path.join(releaseDir, artifact.name);
  const digest = sha256(artifactPath);
  const sidecarName = `${artifact.name}.sha256.txt`;
  const sidecarPath = path.join(releaseDir, sidecarName);

  if (writeChecksums) {
    fs.writeFileSync(sidecarPath, `${digest}  ${artifact.name}\n`, "utf8");
  }

  if (!fs.existsSync(sidecarPath)) {
    console.error(`${artifact.label}: missing .sha256.txt sidecar (${sidecarName})`);
    failed = true;
    continue;
  }

  const line = fs.readFileSync(sidecarPath, "utf8").trim();
  const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line);
  if (!match) {
    console.error(`${artifact.label}: malformed checksum sidecar (${sidecarName})`);
    failed = true;
    continue;
  }
  if (match[1].toLowerCase() !== digest) {
    console.error(`${artifact.label}: checksum mismatch for ${artifact.name}`);
    failed = true;
    continue;
  }
  if (match[2].trim() !== artifact.name) {
    console.error(`${artifact.label}: checksum sidecar names ${match[2].trim()} instead of ${artifact.name}`);
    failed = true;
    continue;
  }

  console.log(`OK ${artifact.label}: ${artifact.name} ${digest}`);
}

if (failed) process.exit(1);
console.log(`Verified ${artifacts.length} release artifact(s) for ${platform}.`);
