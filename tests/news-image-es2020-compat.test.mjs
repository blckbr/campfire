import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const source = fs.readFileSync("src/news/newsImageCandidates.ts", "utf8");

test("news image candidate resolver stays compatible with the ES2020 web target", () => {
  assert.doesNotMatch(
    source,
    /\.replaceAll\s*\(/,
    "String.prototype.replaceAll requires ES2021 typings; CampfireWeb targets ES2020"
  );
});
