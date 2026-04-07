/**
 * Inserts `/page/{pageId}` into a Sigma embed URL immediately before the JWT query segment.
 * Matches server-side behavior in generate-url (path segment, not a query param).
 */
export function appendPageToSigmaEmbedUrl(embedUrl: string, pageId: string): string {
  const trimmed = pageId.trim();
  if (!trimmed) return embedUrl;

  let head: string;
  let tail: string;
  let jwtMarker: string;

  const idxQuestion = embedUrl.indexOf('?:jwt=');
  const idxAmp = embedUrl.indexOf('&:jwt=');

  if (idxQuestion !== -1) {
    head = embedUrl.slice(0, idxQuestion);
    tail = embedUrl.slice(idxQuestion + '?:jwt='.length);
    jwtMarker = '?:jwt=';
  } else if (idxAmp !== -1) {
    head = embedUrl.slice(0, idxAmp);
    tail = embedUrl.slice(idxAmp + '&:jwt='.length);
    jwtMarker = '&:jwt=';
  } else {
    return embedUrl;
  }

  const base = head.replace(/\/page\/[^/]+$/u, '');
  const encoded = encodeURIComponent(trimmed);
  return `${base}/page/${encoded}${jwtMarker}${tail}`;
}
