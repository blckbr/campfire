import { RNNoiseNode } from "simple-rnnoise-wasm";

const registeredContexts = new WeakSet<AudioContext>();

export async function createCampfireRnnoiseNode(
  context: AudioContext
): Promise<AudioNode | null> {
  try {
    if (!registeredContexts.has(context)) {
      await RNNoiseNode.register(context);
      registeredContexts.add(context);
    }

    return new RNNoiseNode(context);
  } catch (error) {
    console.warn(
      "Campfire Voice Pro: RNNoise indisponível; usando Voz limpa.",
      error
    );
    return null;
  }
}
