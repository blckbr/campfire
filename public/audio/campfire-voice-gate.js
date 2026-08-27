class CampfireVoiceGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "thresholdDb",
        defaultValue: -48,
        minValue: -80,
        maxValue: -10,
      },
      {
        name: "floorGain",
        defaultValue: 0.18,
        minValue: 0.05,
        maxValue: 1,
      },
      {
        name: "attackMs",
        defaultValue: 8,
        minValue: 1,
        maxValue: 50,
      },
      {
        name: "releaseMs",
        defaultValue: 180,
        minValue: 40,
        maxValue: 500,
      },
    ];
  }

  constructor() {
    super();
    this.currentGain = 1;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input?.length || !output?.length) {
      return true;
    }

    let sum = 0;
    let count = 0;

    for (const channel of input) {
      for (const sample of channel) {
        sum += sample * sample;
        count += 1;
      }
    }

    const rms = Math.sqrt(sum / Math.max(1, count));
    const db = 20 * Math.log10(Math.max(rms, 1e-7));
    const threshold = parameters.thresholdDb[0];
    const floorGain = parameters.floorGain[0];
    const targetGain = db >= threshold ? 1 : floorGain;
    const smoothingMs =
      targetGain > this.currentGain
        ? parameters.attackMs[0]
        : parameters.releaseMs[0];
    const smoothingSeconds = Math.max(0.001, smoothingMs / 1000);
    const coefficient = Math.exp(
      -128 / (sampleRate * smoothingSeconds)
    );

    this.currentGain =
      targetGain +
      coefficient * (this.currentGain - targetGain);

    for (let channelIndex = 0;
      channelIndex < output.length;
      channelIndex += 1) {
      const sourceChannel =
        input[channelIndex] ?? input[0];
      const targetChannel = output[channelIndex];

      for (let sampleIndex = 0;
        sampleIndex < targetChannel.length;
        sampleIndex += 1) {
        targetChannel[sampleIndex] =
          (sourceChannel?.[sampleIndex] ?? 0) *
          this.currentGain;
      }
    }

    return true;
  }
}

registerProcessor(
  "campfire-voice-gate",
  CampfireVoiceGateProcessor
);
