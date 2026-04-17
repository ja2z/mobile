/**
 * Route-keyed source bus for the card hero transition.
 *
 * When the user taps a folder or applet card, the source screen measures
 * the tapped card's on-screen rect and publishes a `CardHeroSource` keyed
 * by the destination route name. The destination screen's
 * `cardStyleInterpolator` in `_layout.tsx` reads that source at transition
 * start and returns an animated style that scales the destination card up
 * from the source rect to full screen while fading it in.
 *
 * The per-route map is required because sibling screens each own their own
 * source (e.g., Home->Apps's source must survive Apps->Dashboard's tap, so
 * the Home->Apps back transition can still shrink back to the Home tile).
 *
 * This replaces the earlier single-source + overlay + phase-machine design.
 * There is no overlay and no global phase anymore: React Navigation owns
 * the card transition end-to-end, driven by `current.progress`.
 */

import type { Ionicons } from '@expo/vector-icons';

export type CardHeroRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Which level of the card hierarchy originated the hero transition. Kept
 * for diagnostic / future use; the visual layer no longer branches on it.
 */
export type CardHeroVariant = 'L1' | 'L2';

/**
 * Description of the tapped card's on-screen frame. Only `rect` is read by
 * the interpolator today; the other fields are preserved for potential
 * future use (e.g., a source-side fade-out or tint overlay).
 */
export type CardHeroSource = {
  rect: CardHeroRect;
  cornerRadius: number;
  tileBg: string;
  accentColor: string;
  accentBarHeight: number;
  landingColor: string;
  title: string;
  subtitle?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBgColor?: string;
  iconSize?: number;
  variant: CardHeroVariant;
};

const sourcesByRoute = new Map<string, CardHeroSource>();

/**
 * Publish a hero source for a specific destination route. Called by the
 * source screen immediately before `navigation.navigate(routeName)` so the
 * destination's `cardStyleInterpolator` can read it at transition start.
 */
export function setCardHeroSourceForRoute(
  routeName: string,
  src: CardHeroSource,
): void {
  sourcesByRoute.set(routeName, src);
}

/**
 * Read the current source for a route. Returns null if none is registered
 * (e.g., deep link, imperative reset) so the interpolator can fall back to
 * a plain crossfade.
 */
export function getCardHeroSourceForRoute(
  routeName: string,
): CardHeroSource | null {
  return sourcesByRoute.get(routeName) ?? null;
}

/**
 * Clear the source for a route. Called from the destination screen's
 * unmount cleanup so the bus is empty again for the next forward transition
 * (and a subsequent deep-link nav doesn't reuse a stale rect).
 */
export function clearCardHeroSourceForRoute(routeName: string): void {
  sourcesByRoute.delete(routeName);
}
