import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const workflowPath = ".github/workflows/release-1.1.0.yml";
const verifierPath = "scripts/verify-release-artifacts.mjs";

test("release workflow has independent native Windows and Linux jobs", () => {
  assert.equal(fs.existsSync(workflowPath), true, `missing ${workflowPath}`);
  const yaml = fs.readFileSync(workflowPath, "utf8");

  assert.match(yaml, /runs-on:\s*windows-latest/);
  assert.match(yaml, /runs-on:\s*ubuntu-latest/);
  assert.match(yaml, /npm ci/);
  assert.match(yaml, /npm run verify/);
  assert.match(yaml, /npm run dist:win\b/);
  assert.match(yaml, /npm run dist:win:portable/);
  assert.match(yaml, /npm run dist:linux:rpm/);
  assert.match(yaml, /npm run dist:linux:appimage/);
  assert.match(yaml, /actions\/upload-artifact@v\d+/);
  assert.match(yaml, /verify-release-artifacts\.mjs --platform windows/);
  assert.match(yaml, /verify-release-artifacts\.mjs --platform linux/);
});

test("artifact verifier enforces one artifact and checksum sidecar per required format", () => {
  assert.equal(fs.existsSync(verifierPath), true, `missing ${verifierPath}`);
  const source = fs.readFileSync(verifierPath, "utf8");
  assert.match(source, /Campfire-Setup-/);
  assert.match(source, /Campfire-Portable-/);
  assert.match(source, /\.rpm/);
  assert.match(source, /\.AppImage/);
  assert.match(source, /\.sha256\.txt/);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "campfire-release-artifacts-"));
  fs.writeFileSync(path.join(root, "Campfire-Setup-1.1.0-x64.exe"), "setup");
  fs.writeFileSync(path.join(root, "Campfire-Portable-1.1.0-x64.exe"), "portable");

  const missingChecksums = spawnSync(
    process.execPath,
    [verifierPath, "--platform", "windows", "--dir", root],
    { encoding: "utf8" },
  );
  assert.notEqual(missingChecksums.status, 0, "verification must fail without checksum sidecars");

  const writeChecksums = spawnSync(
    process.execPath,
    [verifierPath, "--platform", "windows", "--dir", root, "--write-checksums"],
    { encoding: "utf8" },
  );
  assert.equal(writeChecksums.status, 0, writeChecksums.stderr || writeChecksums.stdout);

  const verified = spawnSync(
    process.execPath,
    [verifierPath, "--platform", "windows", "--dir", root],
    { encoding: "utf8" },
  );
  assert.equal(verified.status, 0, verified.stderr || verified.stdout);
  assert.equal(fs.existsSync(path.join(root, "Campfire-Setup-1.1.0-x64.exe.sha256.txt")), true);
  assert.equal(fs.existsSync(path.join(root, "Campfire-Portable-1.1.0-x64.exe.sha256.txt")), true);
});
