import type { SigmaPage } from '../services/SigmaRestApiService';
import type { PageFooterPageConfig } from '../types/mybuys.types';

const DEFAULT_EMOJI = '📄';

/**
 * When re-fetching workbook pages, keep showInFooter and emoji for pageIds that
 * already exist in the user's config; use API name for display.
 */
export function mergeFetchedPagesWithExisting(
  sigmaPages: SigmaPage[],
  existing: PageFooterPageConfig[],
): PageFooterPageConfig[] {
  const byId = new Map(existing.map((p) => [p.pageId, p]));
  return sigmaPages.map((p) => {
    const prev = byId.get(p.pageId);
    if (prev) {
      return {
        pageId: p.pageId,
        name: p.name,
        showInFooter: prev.showInFooter,
        emoji: prev.emoji,
      };
    }
    return {
      pageId: p.pageId,
      name: p.name,
      showInFooter: true,
      emoji: DEFAULT_EMOJI,
    };
  });
}
