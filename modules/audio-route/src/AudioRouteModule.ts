import { Platform, requireOptionalNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

import type { AudioInput, RouteChangeEvent } from './AudioRoute.types';

type NativeAudioRouteModule = {
  getCurrentInput(): AudioInput | null;
  addListener(
    eventName: 'onRouteChange',
    listener: (event: RouteChangeEvent) => void,
  ): EventSubscription;
};

const nativeModule =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<NativeAudioRouteModule>('AudioRoute')
    : null;

export function getCurrentInput(): AudioInput | null {
  return nativeModule ? nativeModule.getCurrentInput() ?? null : null;
}

export function addRouteChangeListener(
  listener: (event: RouteChangeEvent) => void,
): EventSubscription {
  if (nativeModule) {
    return nativeModule.addListener('onRouteChange', listener);
  }
  return { remove() {} };
}
