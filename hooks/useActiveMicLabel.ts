import { useEffect, useState } from 'react';
import {
  addRouteChangeListener,
  getCurrentInput,
  type AudioInput,
} from '../modules/audio-route/src';

/**
 * Apple's built-in mic port name is "iPhone Microphone" on iPhones and
 * "iPad Microphone" on iPads — already user-friendly. Bluetooth, USB, and
 * wired-headset mics expose their advertised device name via `portName`
 * (e.g. "AirPods Pro", "Shure MV7"), which is also what we want to show.
 * So in practice the raw `portName` is the right thing for every case.
 */
const labelForInput = (input: AudioInput | null): string | null =>
  input?.portName ?? null;

/**
 * Returns a display label for the currently active audio input (iOS only).
 * Returns `null` on Android/web, before the audio session has any input, or
 * if the native module isn't available (e.g. running in Expo Go).
 *
 * Updates live when iOS fires a route change (Bluetooth connect/disconnect,
 * headphone plug, Control Center swap, etc.).
 */
export function useActiveMicLabel(): string | null {
  const [label, setLabel] = useState<string | null>(() =>
    labelForInput(getCurrentInput()),
  );

  useEffect(() => {
    setLabel(labelForInput(getCurrentInput()));
    const sub = addRouteChangeListener((event) => {
      setLabel(labelForInput(event.input));
    });
    return () => sub.remove();
  }, []);

  return label;
}
