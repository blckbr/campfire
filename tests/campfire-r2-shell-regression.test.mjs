import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("approved shell has Campfires only on the left and Friends plus Participants on the right", () => {
  assert.equal(fs.existsSync("src/CampfireRightRail.tsx"), true);
  const home = read("src/CampfireHome.tsx");
  const rail = read("src/CampfireRightRail.tsx");
  assert.match(home, /campfireLeftRail/);
  assert.match(home, /CampfireRightRail/);
  assert.match(rail, /Amigos/);
  assert.match(rail, /Participantes/);
  assert.match(rail, /avatar_url/);
  assert.doesNotMatch(rail, /🔥/);
  assert.doesNotMatch(home, /className="campfireRoster"/);
});

test("center stage renders the selected Campfire cover and keeps Conversation Anime and Screen", () => {
  const home = read("src/CampfireHome.tsx");
  assert.match(home, /campfireStage/);
  assert.match(home, /cover/);
  assert.match(home, /Conversa/);
  assert.match(home, /Anime/);
  assert.match(home, /Tela/);
});


test("opening Campfire lands on Home instead of autojoining the first existing Campfire", () => {
  const home = read("src/CampfireHome.tsx");
  assert.doesNotMatch(home, /\.find\(\s*\(\s*room\s*\)\s*=>\s*room\.myState\s*===\s*["']active["']/);
  assert.match(home, /selectedCampfireId\s*===\s*null/);
});


test("voice stage shows Campfire participant profile images instead of flame placeholders", () => {
  const home = read("src/CampfireHome.tsx");
  assert.match(home, /campfireStageParticipants/);
  assert.match(home, /member\.avatar_url/);
  assert.match(home, /campfireStageAvatar/);
  assert.doesNotMatch(home, /campfireStageParticipant[^\n]*🔥/);
});

test("FriendsModal receives the exact cancel-request prop declared by its Props contract", () => {
  const home = read("src/CampfireHome.tsx");
  const friendsModal = read("src/FriendsModal.tsx");
  assert.match(friendsModal, /onCancelRequest\s*:/);
  assert.match(home, /onCancelRequest\s*=/);
  assert.doesNotMatch(home, /onCancelarRequest\s*=/);
});
