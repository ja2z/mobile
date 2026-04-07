/**
 * Client-side Sigma REST API v2 service.
 * Runs directly from the React Native app (not behind Lambda) — no CORS issues.
 *
 * Endpoints used:
 *   POST {base}/v2/auth/token          — get bearer token
 *   GET  {base}/v2/whoami              — verify credentials
 *   GET  {base}/v2/workbooks/{id}/pages — list pages inside a workbook
 */

import { DEFAULT_SIGMA_API_SERVER, SIGMA_API_SERVERS } from '../constants/SigmaApiServers';

export interface SigmaPage {
  pageId: string;
  name: string;
}

export interface WhoAmIResult {
  success: boolean;
  message: string;
  userId?: string;
  email?: string;
}

export class SigmaRestApiService {
  /**
   * Exchange client credentials for a bearer token.
   */
  static async getAccessToken(
    clientId: string,
    clientSecret: string,
    baseUrl: string = DEFAULT_SIGMA_API_SERVER,
  ): Promise<string> {
    const url = `${baseUrl}/v2/auth/token`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('Invalid REST API credentials. Check your Client ID and Secret.');
      }
      throw new Error(`Failed to get Sigma token (HTTP ${resp.status}): ${body}`);
    }

    const json = await resp.json();
    const token = json.access_token;
    if (!token) {
      throw new Error('No access_token in Sigma auth response');
    }
    return token;
  }

  /**
   * Call GET /v2/whoami to verify credentials are valid.
   */
  static async whoami(
    clientId: string,
    clientSecret: string,
    baseUrl: string = DEFAULT_SIGMA_API_SERVER,
  ): Promise<WhoAmIResult> {
    try {
      const token = await this.getAccessToken(clientId, clientSecret, baseUrl);

      const resp = await fetch(`${baseUrl}/v2/whoami`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        return { success: false, message: `whoami returned HTTP ${resp.status}` };
      }

      const data = await resp.json();
      return {
        success: true,
        message: 'REST API credentials verified',
        userId: data.userId,
        email: data.email,
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'whoami failed' };
    }
  }

  /**
   * Try each known Sigma REST API base URL in order until token + whoami succeed.
   * Returns the first working server, or null if none respond successfully.
   */
  static async detectWorkingApiServer(
    clientId: string,
    clientSecret: string,
  ): Promise<{ baseUrl: string; label: string } | null> {
    for (const server of SIGMA_API_SERVERS) {
      const result = await this.whoami(clientId, clientSecret, server.url);
      if (result.success) {
        return { baseUrl: server.url, label: server.label };
      }
    }
    return null;
  }

  /**
   * Fetch the list of pages in a workbook.
   * Optionally passes bookmarkId / tagName as query params.
   */
  static async listPages(opts: {
    clientId: string;
    clientSecret: string;
    baseUrl?: string;
    workbookId: string;
    bookmarkId?: string | null;
    tagName?: string | null;
  }): Promise<SigmaPage[]> {
    const base = opts.baseUrl || DEFAULT_SIGMA_API_SERVER;
    const token = await this.getAccessToken(opts.clientId, opts.clientSecret, base);

    const qs = new URLSearchParams();
    if (opts.bookmarkId) qs.set('bookmarkId', opts.bookmarkId);
    if (opts.tagName) qs.set('tagName', opts.tagName);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';

    const url = `${base}/v2/workbooks/${encodeURIComponent(opts.workbookId)}/pages${suffix}`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('REST API credentials invalid or insufficient permissions.');
      }
      if (resp.status === 404) {
        throw new Error('Workbook not found. Check the embed URL and API server region.');
      }
      throw new Error(`Failed to fetch pages (HTTP ${resp.status}): ${body}`);
    }

    const json = await resp.json();
    const entries: any[] = json.entries || json.pages || json || [];

    return entries.map((e: any) => ({
      pageId: e.pageId || e.nodeId || e.id || '',
      name: e.name || e.title || 'Untitled',
    }));
  }
}
