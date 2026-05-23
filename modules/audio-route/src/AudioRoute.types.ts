export type AudioInput = {
  /** Human-friendly name from iOS (e.g. "iPhone Microphone", "AirPods Pro"). */
  portName: string;
  /** Apple `AVAudioSessionPort` raw value (e.g. "MicrophoneBuiltIn", "BluetoothHFP"). */
  portType: string;
  /** Stable unique id for this port. */
  uid: string;
};

export type RouteChangeEvent = {
  /** New active input, or `null` if iOS reports no input port. */
  input: AudioInput | null;
};
