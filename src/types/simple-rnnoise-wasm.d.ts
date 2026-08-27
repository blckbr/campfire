declare module "simple-rnnoise-wasm" {
  export class RNNoiseNode extends AudioWorkletNode {
    static register(
      context: AudioContext,
      assetData?: unknown
    ): Promise<void>;

    constructor(context: AudioContext);
    update(keepalive?: boolean | "stat"): void;
  }
}
