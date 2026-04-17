/**
 * Shared pub/sub for the Login screen's logo position on screen.
 *
 * Used by the splash-to-Login "settle" transition: the LoadingScreen overlay
 * reads the measured Login logo target (centerX/Y + size in window coords)
 * and animates its own logo to scale-down + translate onto that target so the
 * reveal lands with zero visual jump. Lifetime is the one-time boot transition.
 */

import { Animated } from 'react-native';

export type LoginLogoTarget = {
  centerX: number;
  centerY: number;
  size: number;
};

/**
 * Shared opacity for the Login screen's logo during the boot transition.
 *
 * Defaults to 1 so Login renders its logo normally for any flow that is NOT
 * the initial coordinated splash-exit (e.g., navigating back to Login after
 * logout). During a coordinated boot, `_layout` sets this to 0 synchronously
 * while booting into Login, then animates it back to 1 at the end of the
 * overlay animation to crossfade with the overlay logo (which has by that
 * point landed on Login's logo position and size).
 */
export const loginLogoOpacity = new Animated.Value(1);

let currentTarget: LoginLogoTarget | null = null;
const listeners = new Set<(t: LoginLogoTarget | null) => void>();

export function setLoginLogoTarget(t: LoginLogoTarget | null) {
  currentTarget = t;
  listeners.forEach((l) => l(t));
}

export function getLoginLogoTarget() {
  return currentTarget;
}

export function subscribeLoginLogoTarget(
  l: (t: LoginLogoTarget | null) => void,
) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
