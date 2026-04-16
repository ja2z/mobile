import * as SecureStore from 'expo-secure-store';
import type { AppletThemeId } from '../constants/AppletThemes';

export const HUB_PERSONALIZATIONS_CHANGED = 'HUB_PERSONALIZATIONS_CHANGED';

export type HubOverride = {
  displayName?: string;
  themeId?: AppletThemeId;
  themeCustomHex?: string;
};

export type HubOverridesMap = Record<string, HubOverride>;

function storageKey(userId: string): string {
  return `hub_overrides_${userId}`;
}

export async function loadAllOverrides(userId: string): Promise<HubOverridesMap> {
  try {
    const raw = await SecureStore.getItemAsync(storageKey(userId));
    if (!raw) return {};
    return JSON.parse(raw) as HubOverridesMap;
  } catch {
    return {};
  }
}

export async function saveOverride(
  userId: string,
  itemId: string,
  override: HubOverride,
): Promise<void> {
  const map = await loadAllOverrides(userId);
  map[itemId] = override;
  await SecureStore.setItemAsync(storageKey(userId), JSON.stringify(map));
}

export async function removeOverride(userId: string, itemId: string): Promise<void> {
  const map = await loadAllOverrides(userId);
  delete map[itemId];
  await SecureStore.setItemAsync(storageKey(userId), JSON.stringify(map));
}
