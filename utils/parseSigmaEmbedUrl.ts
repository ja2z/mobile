/**
 * Parse a Sigma Computing embed URL to extract workbook ID, slug, bookmark, and tag info.
 *
 * Typical embed URL shapes:
 *   https://app.sigmacomputing.com/{slug}/workbook/{workbookId}?:jwt=...&:bookmark={bookmarkId}&...
 *   https://staging.sigmacomputing.io/{slug}/workbook/{workbookId}?:jwt=...
 */

const ALLOWED_HOSTS = ['app.sigmacomputing.com', 'staging.sigmacomputing.io'];

export interface ParsedSigmaEmbedUrl {
  host: string;
  slug: string;
  workbookId: string | null;
  bookmarkId: string | null;
  tagName: string | null;
  jwt: string | null;
}

export function parseSigmaEmbedUrl(rawUrl: string): ParsedSigmaEmbedUrl | null {
  try {
    const urlObj = new URL(rawUrl);

    if (!ALLOWED_HOSTS.includes(urlObj.hostname)) {
      return null;
    }

    // Path segments: /{slug}/workbook/{workbookId}  or /{slug}/ask  etc.
    const segments = urlObj.pathname.split('/').filter(Boolean);
    const slug = segments[0] || '';

    let workbookId: string | null = null;
    const workbookIdx = segments.indexOf('workbook');
    if (workbookIdx !== -1 && segments.length > workbookIdx + 1) {
      workbookId = segments[workbookIdx + 1];
    }

    // Sigma uses colon-prefixed query params like :jwt, :bookmark, :tag
    const jwtMatch = rawUrl.match(/[?&]:jwt=([^&]+)/);
    const bookmarkMatch = rawUrl.match(/[?&]:bookmark=([^&]+)/);
    const tagMatch = rawUrl.match(/[?&]:tag=([^&]+)/);

    return {
      host: urlObj.hostname,
      slug,
      workbookId,
      bookmarkId: bookmarkMatch ? decodeURIComponent(bookmarkMatch[1]) : null,
      tagName: tagMatch ? decodeURIComponent(tagMatch[1]) : null,
      jwt: jwtMatch ? jwtMatch[1] : null,
    };
  } catch {
    return null;
  }
}

/**
 * Extract just the workbook ID from a Sigma embed URL (convenience helper).
 */
export function extractWorkbookId(rawUrl: string): string | null {
  return parseSigmaEmbedUrl(rawUrl)?.workbookId ?? null;
}
