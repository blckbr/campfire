import type { CampfireVoiceProfile } from "../campfireMediaSettings";

export function clampCampfireVolume(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(0, Math.min(200, Math.round(value)));
}

export function campfireVolumeToGain(value: number): number {
  const normalized = clampCampfireVolume(value) / 100;
  return normalized <= 1
    ? normalized
    : normalized * normalized;
}


export function campfireAnalyserLevel(
  analyser: AnalyserNode,
  data: Float32Array<ArrayBuffer>
): number {
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (const value of data) sum += value * value;
  const rms = Math.sqrt(sum / Math.max(1, data.length));
  if (rms <= 0.00001) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(
    0,
    Math.min(100, Math.round(((db + 60) / 60) * 100))
  );
}

export function voiceProfileLabel(
  profile: CampfireVoiceProfile
): string {
  if (profile === "strong") return "Supressão forte";
  if (profile === "studio") return "Studio / Hi-Fi";
  return "Voz limpa";
}

export function configureCampfireCompressor(
  node: DynamicsCompressorNode
): void {
  node.threshold.value = -20;
  node.knee.value = 12;
  node.ratio.value = 3;
  node.attack.value = 0.006;
  node.release.value = 0.18;
}

export function configureCampfireLimiter(
  node: DynamicsCompressorNode
): void {
  node.threshold.value = -4;
  node.knee.value = 4;
  node.ratio.value = 16;
  node.attack.value = 0.002;
  node.release.value = 0.12;
}
