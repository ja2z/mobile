/**
 * Human-readable deep link slugs for My Buys applets: mybuys:word-word-word
 * URL-safe (lowercase letters and hyphens). Uses embedded word lists; no deps.
 */

const PREFIX = 'mybuys:';

/** Subset of memorable, unambiguous words (lowercase). */
const WORDS_A: readonly string[] = [
  'calm', 'swift', 'bright', 'quiet', 'bold', 'gentle', 'keen', 'lucky', 'noble', 'proud',
  'quick', 'warm', 'cool', 'clear', 'fresh', 'grand', 'happy', 'jolly', 'merry', 'sunny',
  'brave', 'clever', 'eager', 'fancy', 'kindly', 'lively', 'mighty', 'nimble', 'polite', 'rustic',
  'steady', 'tidy', 'vivid', 'witty', 'young', 'zesty', 'amber', 'azure', 'coral', 'crimson',
  'golden', 'ivory', 'jade', 'olive', 'pearl', 'ruby', 'sable', 'silver', 'violet', 'crimson',
];

const WORDS_B: readonly string[] = [
  'river', 'meadow', 'forest', 'harbor', 'summit', 'canyon', 'island', 'valley', 'garden', 'orchard',
  'bridge', 'castle', 'harbor', 'lighthouse', 'meadow', 'oasis', 'prairie', 'savanna', 'tundra', 'volcano',
  'anchor', 'beacon', 'compass', 'harvest', 'horizon', 'journey', 'mirage', 'nebula', 'pathway', 'quartz',
  'ripple', 'shelter', 'thunder', 'voyage', 'whisper', 'zephyr', 'breeze', 'cascade', 'dawn', 'dusk',
  'ember', 'falcon', 'glacier', 'harvest', 'lagoon', 'meadow', 'north', 'oasis', 'prairie', 'south',
];

const WORDS_C: readonly string[] = [
  'eagle', 'heron', 'falcon', 'otter', 'badger', 'beaver', 'canary', 'cougar', 'dolphin', 'finch',
  'gazelle', 'heron', 'ibis', 'jay', 'koala', 'lark', 'moose', 'newt', 'orca', 'panda',
  'quail', 'rabbit', 'salmon', 'tiger', 'urchin', 'viper', 'walrus', 'xerus', 'yak', 'zebra',
  'apple', 'birch', 'cedar', 'daisy', 'elm', 'fern', 'grape', 'hazel', 'iris', 'juniper',
  'kite', 'lotus', 'maple', 'nova', 'oak', 'pine', 'quince', 'reed', 'spruce', 'willow',
];

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

/**
 * Returns a new slug string with prefix mybuys:word-word-word (not guaranteed unique).
 */
export function generateMyBuysDeepLinkSlug(): string {
  const a = WORDS_A[randomInt(WORDS_A.length)];
  const b = WORDS_B[randomInt(WORDS_B.length)];
  const c = WORDS_C[randomInt(WORDS_C.length)];
  return `${PREFIX}${a}-${b}-${c}`;
}

export const MY_BUYS_DEEP_LINK_PREFIX = PREFIX;
