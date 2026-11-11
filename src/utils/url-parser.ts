import type { LanhuUrlParams } from '../types/lanhu.ts';

// Parse the raw param string (or a full Lanhu URL) into Lanhu ids.
// Any form works: full URL, fragment query (?tid=..&pid=..), or bare params.
export function parseLanhuParams(url: string): LanhuUrlParams {
  let paramStr = url;

  // Extract the fragment query when a full URL is provided.
  if (url.startsWith('http')) {
    const hashIndex = url.indexOf('#');
    if (hashIndex === -1) {
      throw new Error('Invalid Lanhu URL: missing fragment part');
    }
    const fragment = url.slice(hashIndex + 1);
    const qIndex = fragment.indexOf('?');
    paramStr = qIndex !== -1 ? fragment.slice(qIndex + 1) : fragment;
  }

  // Remove a leading question mark for query-like input.
  if (paramStr.startsWith('?')) {
    paramStr = paramStr.slice(1);
  }

  // Parse key-value pairs from the parameter string.
  const params: Record<string, string> = {};
  for (const part of paramStr.split('&')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex !== -1) {
      params[part.slice(0, eqIndex)] = part.slice(eqIndex + 1);
    }
  }

  // Fall back to LANHU_TID so URLs copied without tid (Lanhu dropped it from
  // some address bars) still work. A tid in the URL always wins.
  const teamId = params.tid || process.env.LANHU_TID?.trim() || undefined;
  const projectId = params.pid || params.project_id;
  const docId = params.docId || params.image_id;
  const versionId = params.versionId;

  if (!projectId) {
    throw new Error(
      'URL parsing failed: missing required param pid (project_id)'
    );
  }
  if (!teamId) {
    throw new Error(
      'URL parsing failed: missing required param tid (team_id). Add tid to the URL or set the LANHU_TID env var.'
    );
  }

  return { teamId, projectId, docId, versionId };
}

// Parse a Lanhu design detail URL like:
// https://lanhuapp.com/web/#/item/project/detailDetach?tid=...&pid=...&image_id=...
// Requires image_id/docId on top of the project params.
export function parseLanhuUrl(url: string): LanhuUrlParams & { docId: string } {
  const params = parseLanhuParams(url);

  if (!params.docId) {
    throw new Error(
      'URL parsing failed: missing required param image_id (docId)'
    );
  }

  return params as LanhuUrlParams & { docId: string };
}
