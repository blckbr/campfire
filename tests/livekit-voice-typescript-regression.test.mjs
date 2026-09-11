import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/useCampfireLiveKitVoice.ts', import.meta.url), 'utf8');

test('LiveKit voice does not shadow the local getUserVolume with an unused import', () => {
  const importBlock = source.match(/from "\.\/userLocalMediaPreferences";[\s\S]*?/);
  assert.doesNotMatch(
    source.slice(0, source.indexOf('export type CampfirePresenceStatus')),
    /\bgetUserVolume\s*,/,
    'getUserVolume must not be imported when the hook defines its own getter'
  );
});

test('presence sync remains compatible with the current TypeScript lib target', () => {
  assert.doesNotMatch(source, /entries\.at\(-1\)/, 'Array.at requires ES2022 and breaks the current project target');
  assert.match(source, /entries\[entries\.length\s*-\s*1\]/);
});

test('LiveKit TrackSubscribed handlers use the v2 three-argument event signature', () => {
  assert.match(source, /type RemoteTrackPublication/);
  assert.match(
    source,
    /const upsertRemoteTrack = useCallback\(\(track: RemoteTrack, \w+: RemoteTrackPublication, participant: RemoteParticipant\)/
  );
  assert.match(
    source,
    /const removeRemoteTrack = useCallback\(\(track: RemoteTrack, \w+: RemoteTrackPublication, participant: RemoteParticipant\)/
  );
});
