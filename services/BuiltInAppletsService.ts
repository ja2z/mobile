/**
 * Built-in Applets Service
 * Fetches built-in applet metadata from the API for list screens and deep links
 */

import { Config } from '../constants/Config';
import { AuthService } from './AuthService';

export interface BuiltInApplet {
  applet_id: string;
  slug: string;
  list_screen: string;
  target_screen: string;
  app_name: string | null;
  name: string;
  subtitle: string | null;
  workbook_id: string | null;
  /** Sigma page id for initial embed when opening this built-in applet from a list (optional). */
  initial_page_id?: string | null;
  embed_path: string;
  icon_name: string | null;
  color: string | null;
  sort_order: number;
  teams: string[] | null;
  user_attributes: Record<string, unknown> | null;
  account_type: string | null;
}

/**
 * Module-level in-memory cache. Lives for the lifetime of the JS runtime
 * (cleared on full app reload / re-login). The first successful fetch
 * populates it; subsequent `listBuiltInApplets()` calls resolve from cache.
 * `inFlight` dedupes concurrent fetches — if Home prefetch is still running
 * when a folder screen also calls, both await the same promise.
 */
let cachedApplets: BuiltInApplet[] | null = null;
let inFlight: Promise<BuiltInApplet[]> | null = null;

async function fetchBuiltInAppletsFromNetwork(): Promise<BuiltInApplet[]> {
  const session = await AuthService.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  const baseUrl = Config.API.ADMIN_BASE_URL.replace('/admin', '');
  const url = `${baseUrl}/applets/built-in`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.jwt}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `Failed to fetch applets: ${response.status}`);
  }

  const data = await response.json();
  return data.applets || [];
}

/**
 * List all built-in applets. Returns cached results when available, otherwise
 * performs the network fetch and populates the cache. Concurrent callers
 * share a single in-flight request. Pass `forceRefresh` to bypass the cache
 * and refetch from the network (pull-to-refresh).
 * Requires authentication.
 */
export async function listBuiltInApplets(
  options?: { forceRefresh?: boolean },
): Promise<BuiltInApplet[]> {
  if (options?.forceRefresh) {
    cachedApplets = null;
    if (!inFlight) {
      inFlight = fetchBuiltInAppletsFromNetwork()
        .then((applets) => {
          cachedApplets = applets;
          return applets;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  }

  if (cachedApplets) return cachedApplets;
  if (inFlight) return inFlight;

  inFlight = fetchBuiltInAppletsFromNetwork()
    .then((applets) => {
      cachedApplets = applets;
      return applets;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Synchronous read of the current cache. Returns null when the cache has
 * never been populated, so folder screens can decide whether to seed their
 * initial render state or show a loading placeholder.
 */
export function getCachedBuiltInAppletsSync(): BuiltInApplet[] | null {
  return cachedApplets;
}

/**
 * Fire-and-forget warm-up. Intended to be called from Home on mount so the
 * list is ready by the time the user taps into a folder. Errors are
 * swallowed (the real folder screen fetch will surface them via its own
 * error path) so a failed prefetch can't crash Home.
 */
export function prefetchBuiltInApplets(): void {
  if (cachedApplets || inFlight) return;
  void listBuiltInApplets().catch(() => {
    /* intentionally ignored — folder screens retry/fetch themselves */
  });
}

/**
 * Drop the cache. Call after auth changes (login/logout) or any time the
 * server-side list of built-in applets is expected to have changed.
 */
export function invalidateBuiltInAppletsCache(): void {
  cachedApplets = null;
}
