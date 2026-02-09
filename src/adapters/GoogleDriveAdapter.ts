import type { FileMeta, StorageProvider } from './StorageProvider';

export interface GoogleDriveConfig {
  clientId: string;
  apiKey: string;
  rootFolderId?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: string;
  scope: string;
  token_type: string;
  error?: any;
}

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

export class GoogleDriveAdapter implements StorageProvider {
  private config: GoogleDriveConfig | null = null;
  private tokenClient: any;
  private accessToken: string | null = null;
  private tokenExpiration: number = 0;
  private lastInteractiveAuthAttemptAt = 0;
  private readonly interactiveAuthCooldownMs = 10 * 60 * 1000;
  private isInitialized = false;
  private inFlightInit: Promise<void> | null = null;
  private fileCache: Map<string, { id: string; name: string }> = new Map();
  private writeLocks = new Map<string, Promise<void>>();
  private inFlightSignIn: Promise<void> | null = null;
  private pendingAuth:
    | null
    | {
        resolve: () => void;
        reject: (err: any) => void;
        settle: (fn: () => void) => void;
        startedAt: number;
        interactive: boolean;
        useRedirect: boolean;
        redirectFallbackTriggered: boolean;
        config: any;
      } = null;

  private driveApiLoaded = false;
  private inFlightDriveApiLoad: Promise<void> | null = null;

  private isIosStandalone(): boolean {
    // iOS Safari exposes navigator.standalone for Home Screen apps.
    // Some environments only expose display-mode: standalone.
    const navAny = navigator as any;
    if (navAny?.standalone === true) return true;
    try {
      return window.matchMedia?.('(display-mode: standalone)')?.matches === true;
    } catch {
      return false;
    }
  }

  private shouldUseRedirectFlow(): boolean {
    // Use redirect flow for:
    // 1. iOS/Android standalone PWAs (popups are blocked)
    // 2. Any mobile device in standalone mode
    // 3. Mobile browsers where popups are unreliable
    if (this.isIosStandalone()) return true;
    
    // Check for mobile user agent - popups are unreliable on mobile
    const ua = navigator.userAgent.toLowerCase();
    const isMobile = /iphone|ipad|ipod|android|mobile|webos|blackberry|opera mini|iemobile/i.test(ua);
    
    // If mobile AND display-mode is standalone or fullscreen, definitely use redirect
    if (isMobile) {
      try {
        const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
        const isFullscreen = window.matchMedia?.('(display-mode: fullscreen)')?.matches;
        if (isStandalone || isFullscreen) return true;
      } catch {
        // Ignore matchMedia errors
      }
      // On mobile, always prefer redirect for better UX
      return true;
    }
    
    return false;
  }

  private isConsentOrInteractionRequired(err: any): boolean {
    const type = String(err?.type ?? err?.error ?? err?.code ?? '').toLowerCase();
    const message = String(err?.message ?? '').toLowerCase();

    // GIS token flow commonly uses these identifiers.
    const combined = `${type} ${message}`;
    return (
      combined.includes('consent_required') ||
      combined.includes('interaction_required') ||
      combined.includes('login_required')
    );
  }

  private consumeTokenFromUrlIfPresent() {
    try {
      const url = new URL(window.location.href);

      // GIS redirect-mode commonly returns tokens in the URL hash.
      const hash = url.hash?.startsWith('#') ? url.hash.slice(1) : '';
      const hashParams = new URLSearchParams(hash);

      const accessToken = hashParams.get('access_token') || url.searchParams.get('access_token');
      const expiresIn = hashParams.get('expires_in') || url.searchParams.get('expires_in');
      const scope = hashParams.get('scope') || url.searchParams.get('scope');
      const tokenType = hashParams.get('token_type') || url.searchParams.get('token_type');

      if (accessToken && expiresIn && tokenType) {
        this.handleTokenResponse({
          access_token: accessToken,
          expires_in: expiresIn,
          scope: scope || '',
          token_type: tokenType,
        });

        // Clean sensitive token info from the URL.
        url.hash = '';
        url.searchParams.delete('access_token');
        url.searchParams.delete('expires_in');
        url.searchParams.delete('scope');
        url.searchParams.delete('token_type');
        window.history.replaceState({}, document.title, url.toString());
      }
    } catch {
      // Ignore parse errors.
    }
  }

  private getRedirectUri(): string {
    // Use the current path (not just origin) so GitHub Pages subpaths and PWAs
    // return to the actual app URL after redirect-based auth.
    // Do not include query/hash in the registered redirect URI.
    try {
      const url = new URL(window.location.href);
      url.hash = '';
      url.search = '';
      return url.toString();
    } catch {
      return window.location.origin + window.location.pathname;
    }
  }

  private createTokenClient(uxMode: 'popup' | 'redirect') {
    return window.google.accounts.oauth2.initTokenClient({
      client_id: this.config!.clientId,
      // Use 'drive.file' scope as required by Google for verification.
      // This means we only see files we created or opened via Picker.
      scope: 'https://www.googleapis.com/auth/drive.file',
      include_granted_scopes: false,
      ux_mode: uxMode,
      // For redirect mode, return to the current app URL.
      redirect_uri: this.getRedirectUri(),
      callback: (response: TokenResponse) => {
        this.handleAuthCallback(response);
      },
      error_callback: (err: any) => {
        this.handleAuthError(err);
      },
    });
  }

  private handleAuthCallback(response: TokenResponse) {
    if (response?.error !== undefined) {
      const pending = this.pendingAuth;
      if (pending) {
        pending.settle(() => pending.reject(response));
      }
      return;
    }

    try {
      this.handleTokenResponse(response);
      const pending = this.pendingAuth;
      if (pending) {
        pending.settle(() => pending.resolve());
      }
    } catch (e) {
      const pending = this.pendingAuth;
      if (pending) {
        pending.settle(() => pending.reject(e));
      }
    }
  }

  private handleAuthError(err: any) {
    const pending = this.pendingAuth;
    if (!pending) return;

    const type = err?.type ?? err?.error;
    const msg = String(err?.message ?? '');
    const isPopupClosed = type === 'popup_closed' || msg.toLowerCase().includes('popup window closed');
    const isPopupFailed =
      type === 'popup_failed_to_open' || msg.toLowerCase().includes('failed to open popup');
    const isPopupError = isPopupClosed || isPopupFailed;

    // If the popup closes almost immediately, it's often a popup-block / COOP-related failure.
    // Redirect does not rely on opener/popup communication, so it's a good fallback.
    if (
      pending.interactive &&
      !pending.useRedirect &&
      !pending.redirectFallbackTriggered &&
      isPopupError &&
      Date.now() - pending.startedAt < 1000
    ) {
      pending.redirectFallbackTriggered = true;
      try {
        this.createTokenClient('redirect').requestAccessToken(pending.config);
        return;
      } catch {
        // Fall through to rejection.
      }
    }

    pending.settle(() => pending.reject(err));
  }

  private createAuthRequiredError(message = 'Google Drive authentication required') {
    const err = new Error(message) as Error & { code?: string };
    err.code = 'google_auth_required';
    return err;
  }

  private getPickerAppId(): string | null {
    // Picker's setAppId expects the numeric project number.
    // For many OAuth client IDs, the prefix before the first '-' is that number.
    const clientId = this.config?.clientId ?? '';
    const maybeProjectNumber = clientId.split('-')[0] ?? '';
    return /^\d+$/.test(maybeProjectNumber) ? maybeProjectNumber : null;
  }

  constructor() {
    // If we returned from an OAuth redirect, consume the token ASAP.
    this.consumeTokenFromUrlIfPresent();

    const savedConfigStr = localStorage.getItem('google-drive-config');
    let savedConfig: GoogleDriveConfig | null = null;
    try {
      if (savedConfigStr) {
        savedConfig = JSON.parse(savedConfigStr);
      }
    } catch (e) {
      console.error('Failed to parse saved config', e);
    }

    // Try to restore token
    const savedToken = localStorage.getItem('google-drive-token');
    const savedExpiration = localStorage.getItem('google-drive-token-expires');

    if (savedToken && savedExpiration) {
      const expiresAt = parseInt(savedExpiration, 10);
      if (Date.now() < expiresAt) {
        this.accessToken = savedToken;
        this.tokenExpiration = expiresAt;
        console.log('Restored valid Google Drive token, expires in', Math.round((expiresAt - Date.now()) / 1000), 'seconds');
      } else {
        console.log('Stored Google Drive token is expired');
      }
    }

    // Load from environment variables
    const envClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
    const envApiKey = import.meta.env.VITE_GOOGLE_API_KEY || '';

    // Merge saved config with env vars (env vars act as defaults if saved values are missing)
    this.config = {
      clientId: savedConfig?.clientId || envClientId,
      apiKey: savedConfig?.apiKey || envApiKey,
      rootFolderId: savedConfig?.rootFolderId
    };
  }

  setConfig(config: GoogleDriveConfig) {
    this.config = config;
    localStorage.setItem('google-drive-config', JSON.stringify(config));
    // Don't force re-init if only rootFolderId changed, but for simplicity we can leave it or adjust.
    // If we change config, we might need to re-init if keys changed.
    // If only rootFolderId changed, we don't strictly need to re-init, but it's safer.
    this.isInitialized = false; 
  }

  getConfig(): GoogleDriveConfig | null {
    return this.config;
  }

  private async loadScripts(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.gapi && window.google) {
        resolve();
        return;
      }

      const script1 = document.createElement('script');
      script1.src = 'https://apis.google.com/js/api.js';
      script1.onload = () => {
        const script2 = document.createElement('script');
        script2.src = 'https://accounts.google.com/gsi/client';
        script2.onload = () => resolve();
        script2.onerror = reject;
        document.body.appendChild(script2);
      };
      script1.onerror = reject;
      document.body.appendChild(script1);
    });
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.inFlightInit) return this.inFlightInit;
    if (!this.config) throw new Error('Google Drive config not set');
    if (!this.config.clientId) throw new Error('Google Drive Client ID is missing. Please configure it in Settings.');
    if (!this.config.apiKey) throw new Error('Google Drive API Key is missing. Please configure it in Settings.');

    this.inFlightInit = (async () => {
      await this.loadScripts();

      await new Promise<void>((resolve, reject) => {
        // Load both client and picker libraries
        window.gapi.load('client:picker', async () => {
          try {
            console.log('Initializing GAPI client...');
            // Minimal init - just API key, no discovery docs yet to avoid 502s
            await window.gapi.client.init({
              apiKey: this.config!.apiKey,
            });
            console.log('GAPI client initialized (minimal)');

            // Default to popup; iOS A2HS will use a redirect client in signIn().
            this.tokenClient = this.createTokenClient('popup');

            this.isInitialized = true;

            // If we restored a valid token, ensure it's set on the client immediately
            if (this.accessToken) {
              window.gapi.client.setToken({ access_token: this.accessToken });
            }

            resolve();
          } catch (err) {
            console.error('GAPI Init Error:', JSON.stringify(err, null, 2));
            reject(err);
          }
        });
      });
    })();

    try {
      await this.inFlightInit;
    } finally {
      this.inFlightInit = null;
    }
  }

  private async ensureDriveApi() {
    if (this.driveApiLoaded) return;
    if (this.inFlightDriveApiLoad) return this.inFlightDriveApiLoad;

    console.log('Loading Drive API...');
    this.inFlightDriveApiLoad = (async () => {
      try {
        // Try loading via URL which is often more robust
        await window.gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
        this.driveApiLoaded = true;
        console.log('Drive API loaded via URL');
      } catch (e) {
        console.error('Failed to load Drive API via URL, trying shorthand...', e);
        // Fallback
        await window.gapi.client.load('drive', 'v3');
        this.driveApiLoaded = true;
        console.log('Drive API loaded via shorthand');
      }
    })();

    try {
      await this.inFlightDriveApiLoad;
    } finally {
      this.inFlightDriveApiLoad = null;
    }
  }

  async signIn(options?: { interactive?: boolean; prompt?: string }): Promise<void> {
    if (!this.isInitialized) await this.init();

    const forcePrompt = typeof options?.prompt === 'string' && options.prompt.length > 0;

    // If we already have a valid token, don't prompt.
    // (Unless the caller explicitly forces a prompt, e.g. select_account.)
    if (!forcePrompt && this.accessToken && Date.now() < this.tokenExpiration) {
      if (window.gapi?.client) {
        window.gapi.client.setToken({ access_token: this.accessToken });
      }
      return;
    }

    // Coalesce concurrent sign-in attempts so we don't open multiple popups.
    if (this.inFlightSignIn) {
      await this.inFlightSignIn;
      return;
    }

    const requestToken = (params: { interactive: boolean; prompt: string }): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        const { interactive, prompt } = params;
        const config: any = { prompt };

        // Mobile/PWA environments frequently block popups. Use redirect for interactive auth.
        const useRedirect = interactive && this.shouldUseRedirectFlow();
        const client = useRedirect ? this.createTokenClient('redirect') : this.tokenClient;

        const startedAt = Date.now();

        let settled = false;
        const timeoutMs = interactive ? 2 * 60 * 1000 : 20 * 1000;
        const timeoutId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          this.pendingAuth = null;
          reject(new Error('google_auth_timeout'));
        }, timeoutMs);

        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          this.pendingAuth = null;
          fn();
        };

        this.pendingAuth = {
          resolve,
          reject,
          settle,
          startedAt,
          interactive,
          useRedirect,
          redirectFallbackTriggered: false,
          config,
        };

        // If popup fails to open (common on iOS A2HS), fallback to redirect.
        try {
          client.requestAccessToken(config);
        } catch (e: any) {
          if (interactive && !useRedirect) {
            try {
              this.createTokenClient('redirect').requestAccessToken(config);
              return;
            } catch {
              // Ignore; we'll reject below.
            }
          }
          settle(() => reject(e));
        }
      });
    };

    this.inFlightSignIn = (async () => {
      const interactive = options?.interactive === true;

      // Important: prompt='consent' forces the consent UI every time.
      // For a better UX, try prompt='' first and only fall back to consent when required.
      if (forcePrompt) {
        await requestToken({ interactive, prompt: options!.prompt! });
        return;
      }

      try {
        await requestToken({ interactive, prompt: '' });
      } catch (e: any) {
        if (interactive && this.isConsentOrInteractionRequired(e)) {
          await requestToken({ interactive, prompt: 'consent' });
          return;
        }
        throw e;
      }
    })();

    try {
      await this.inFlightSignIn;
    } finally {
      this.inFlightSignIn = null;
    }
  }

  async switchAccount(): Promise<void> {
    if (!this.isInitialized) await this.init();

    // Force a fresh flow with account chooser.
    this.accessToken = null;
    this.tokenExpiration = 0;
    localStorage.removeItem('google-drive-token');
    localStorage.removeItem('google-drive-token-expires');

    await this.signIn({ interactive: true, prompt: 'select_account' });
  }
  private handleTokenResponse(resp: TokenResponse) {
    this.accessToken = resp.access_token;
    // expires_in is in seconds. Subtract a buffer (e.g. 5 mins) to be safe.
    // Some environments may omit/serialize expires_in unexpectedly; guard so we
    // don't treat a valid token as immediately expired.
    const rawExpiresIn: any = (resp as any)?.expires_in;
    const parsedExpiresIn = typeof rawExpiresIn === 'number' ? rawExpiresIn : parseInt(String(rawExpiresIn ?? ''), 10);
    const expiresIn = Number.isFinite(parsedExpiresIn) && parsedExpiresIn > 0 ? parsedExpiresIn : 3600;
    this.tokenExpiration = Date.now() + Math.max(0, expiresIn - 300) * 1000;
    
    localStorage.setItem('google-drive-token', this.accessToken!);
    localStorage.setItem('google-drive-token-expires', this.tokenExpiration.toString());

    // Ensure gapi client has the token for requests
    if (this.accessToken && window.gapi?.client) {
      window.gapi.client.setToken({ access_token: this.accessToken });
    }
  }

  private async ensureAuth(options?: { interactive?: boolean }) {
    const interactive = options?.interactive === true;

    if (!this.isInitialized) {
      await this.init();
    }

    const hasValidToken = !!(this.accessToken && Date.now() < this.tokenExpiration);
    if (!hasValidToken) {
      if (!interactive) {
        // Try a silent refresh first (no popup). If the browser/account requires
        // user interaction, automatically escalate to an interactive flow.
        try {
          await this.signIn({ interactive: false });
        } catch (e: any) {
          if (this.isConsentOrInteractionRequired(e)) {
            // Avoid repeatedly prompting the user; show reconnect banner within cooldown.
            const now = Date.now();
            const withinCooldown = now - this.lastInteractiveAuthAttemptAt < this.interactiveAuthCooldownMs;
            if (withinCooldown) {
              throw this.createAuthRequiredError('Google Drive session expired. Please reconnect.');
            }

            // Escalate to an interactive sign-in (popup/redirect) automatically.
            try {
              this.lastInteractiveAuthAttemptAt = now;
              await this.signIn({ interactive: true });
            } catch {
              // If the interactive flow fails (popup blocked/closed/etc), fall back
              // to surfacing the reconnect banner so the user can retry explicitly.
              throw this.createAuthRequiredError('Google Drive session expired. Please reconnect.');
            }
          }
          throw e;
        }
      } else {
        await this.signIn({ interactive: true });
      }
    }

    // Ensure gapi client has the token for requests
    if (this.accessToken && window.gapi?.client) {
      window.gapi.client.setToken({ access_token: this.accessToken });
    }
  }

  private async findFileId(path: string): Promise<string | null> {
    // 1. Check cache
    const cached = this.fileCache.get(path);
    if (cached) return cached.id;

    // Callers must ensure auth + Drive API.

    const rootId = this.config?.rootFolderId;
    
    // Strategy: Search globally by name first, then filter by parent in memory.
    // This helps debug why 'parents' query might be failing and ensures we see all candidates.
    const safePath = path.replace(/'/g, "\\'");
    const query = `name = '${safePath}' and trashed = false`;
    
    try {
      const response = await window.gapi.client.drive.files.list({
        q: query,
        fields: 'files(id, name, parents, mimeType)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize: 1000
      });

      const files = response.result.files;
      
      if (files && files.length > 0) {
        // Filter: Must match name exactly
        let matches = files.filter((f: { name: string; parents?: string[] }) => f.name === path);

        // Filter: If rootId is configured, must be in that folder
        if (rootId) {
            const folderMatches = matches.filter((f: { name: string; parents?: string[] }) => f.parents && f.parents.includes(rootId));
            if (folderMatches.length === 0 && matches.length > 0) {
                // If we found files but not in the folder, we return null so a new one is created in the correct folder.
                return null;
            }
            matches = folderMatches;
        }
        
        if (matches.length > 0) {
           if (matches.length > 1) {
             console.warn(`[GoogleDrive] Found ${matches.length} valid matches for ${path}. Using first.`);
           }
           const match = matches[0];
           this.fileCache.set(path, { id: match.id, name: path });
           return match.id;
        }
      }
      return null;
    } catch (e) {
      console.error('[GoogleDrive] findFileId failed', e);
      return null;
    }
  }

  async list(_path: string): Promise<string[]> {
    void _path;
    await this.ensureAuth({ interactive: false });
    await this.ensureDriveApi();
    
    try {
      // Simplified query strategy:
      // If a root folder is selected, fetch ALL non-trashed files in that folder and filter in memory.
      // This avoids issues where 'name contains' might fail or behave unexpectedly.
      // If no root folder, we must filter by name in the query to avoid listing the entire Drive.
      
      let query = "trashed = false";
      if (this.config?.rootFolderId) {
        query = `'${this.config.rootFolderId}' in parents and ${query}`;
      } else {
        query = `(name contains '.md' or name contains '.markdown') and ${query}`;
      }
      
      console.log(`[GoogleDrive] Listing files with query: ${query}`);

      const response = await window.gapi.client.drive.files.list({
        q: query,
        fields: 'files(id, name, mimeType, parents)',
        spaces: 'drive',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageSize: 1000 // Fetch more items since we might filter many out in memory
      });
      
      console.log(`[GoogleDrive] Raw list response:`, response.result.files);

      const files = response.result.files;
      // Do not clear the cache here.
      // Users can import files via Picker that are outside the current root folder.
      // Clearing would drop those name->id mappings and make the imported files appear "missing".
      
      if (files && files.length > 0) {
        const uniqueFiles = new Set<string>();
        const result: string[] = [];
        
        files.forEach((f: any) => {
          // In-memory filter for markdown files
          // We check for extension OR mimeType
          const name = f.name.toLowerCase();
          const isMarkdown = (name.endsWith('.md') || 
                             name.endsWith('.markdown') || 
                             f.mimeType === 'text/markdown') &&
                             f.mimeType !== 'application/vnd.google-apps.folder';
          
          // Also allow config files
          const isConfig = name === '.todolist-md.config.json';

          if ((isMarkdown || isConfig) && !uniqueFiles.has(f.name)) {
            uniqueFiles.add(f.name);
            this.fileCache.set(f.name, { id: f.id, name: f.name });
            if (isMarkdown) result.push(f.name);
            // We don't push config to the file list UI, but we cache it for reading
          }
        });
        console.log(`[GoogleDrive] Filtered result:`, result);
        return result;
      }
      return [];
    } catch (e) {
      console.error('Error listing files', e);
      // If token expired/invalid, do not auto-prompt from background operations.
      if ((e as any).status === 401) {
        this.accessToken = null;
        throw this.createAuthRequiredError('Google Drive session expired. Please reconnect.');
      }
      return [];
    }
  }

  async read(path: string): Promise<string | null> {
    await this.ensureAuth({ interactive: false });
    await this.ensureDriveApi();
    
    const fileId = await this.findFileId(path);
    if (!fileId) return null;

    try {
      const response = await window.gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media',
        supportsAllDrives: true
      });
      return response.body;
    } catch (e) {
      console.error('Error reading file', e);
      if ((e as any).status === 404) {
        this.fileCache.delete(path);
        const err = new Error(
          'Google Drive cannot access this file (404). With drive.file scope, please re-import the file (Import Files) or switch to the correct Google account.'
        ) as Error & { code?: string };
        err.code = 'google_drive_not_found';
        throw err;
      }
      if ((e as any).status === 401) {
        this.accessToken = null;
        throw this.createAuthRequiredError('Google Drive session expired. Please reconnect.');
      }
      return null;
    }
  }

  async readWithMeta(path: string): Promise<{ content: string | null; meta?: FileMeta }> {
    await this.ensureAuth({ interactive: false });
    await this.ensureDriveApi();

    const fileId = await this.findFileId(path);
    if (!fileId) return { content: null };

    try {
      const metaResp = await window.gapi.client.drive.files.get({
        fileId,
        fields: 'id,name,modifiedTime,version',
        supportsAllDrives: true
      });

      const etagHeader = (metaResp as any)?.headers?.etag || (metaResp as any)?.headers?.ETag;
      const meta: FileMeta = {
        etag: etagHeader,
        modifiedTime: metaResp.result?.modifiedTime,
        version: metaResp.result?.version,
      };

      const contentResp = await window.gapi.client.drive.files.get({
        fileId,
        alt: 'media',
        supportsAllDrives: true
      });

      return { content: contentResp.body, meta };
    } catch (e) {
      console.error('Error reading file (with meta)', e);
      if ((e as any).status === 404) {
        this.fileCache.delete(path);
        const err = new Error(
          'Google Drive cannot access this file (404). With drive.file scope, please re-import the file (Import Files) or switch to the correct Google account.'
        ) as Error & { code?: string };
        err.code = 'google_drive_not_found';
        throw err;
      }
      if ((e as any).status === 401) {
        this.accessToken = null;
        throw this.createAuthRequiredError('Google Drive session expired. Please reconnect.');
      }
      return { content: null };
    }
  }

  async write(path: string, content: string): Promise<void> {
    // Serialize writes to the same path to prevent race conditions (duplicates)
    // If a write is already in progress for this path, wait for it to finish.
    while (this.writeLocks.has(path)) {
        try {
            await this.writeLocks.get(path);
        } catch {
            // Ignore errors from previous writes, just proceed
        }
    }

    // Create a new lock
    let unlock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
        unlock = resolve;
    });
    this.writeLocks.set(path, lockPromise);

    try {
      // Writes should not trigger OAuth UI automatically (especially in background, e.g. config sync).
      // If auth is required, throw and let the UI prompt the user to reconnect.
      await this.ensureAuth({ interactive: false });
        await this.ensureDriveApi();

        const fileId = await this.findFileId(path);
        
        const metadata: any = {
          name: path,
          mimeType: path.endsWith('.json') ? 'application/json' : 'text/markdown',
        };

        // Only set parents on creation, not update.
        if (!fileId && this.config?.rootFolderId) {
          metadata.parents = [this.config.rootFolderId];
        }

        if (fileId) {
            // Update content only using 'media' uploadType
            // This avoids metadata permission issues and is simpler for content updates
            console.log(`[GoogleDrive] Updating file content ${fileId} (${path})...`);
            await window.gapi.client.request({
              path: `/upload/drive/v3/files/${fileId}`,
              method: 'PATCH',
              params: { 
                uploadType: 'media',
                supportsAllDrives: true
              },
              headers: {
                'Content-Type': path.endsWith('.json') ? 'application/json' : 'text/markdown',
              },
              body: content,
            });
        } else {
            // Create new file using 'multipart' to set metadata (name, parents)
            console.log(`[GoogleDrive] Creating new file ${path}...`);
            
            const multipartRequestBody =
              `\r\n--foo_bar_baz\r\n` +
              `Content-Type: application/json\r\n\r\n` +
              JSON.stringify(metadata) +
              `\r\n--foo_bar_baz\r\n` +
              `Content-Type: ${path.endsWith('.json') ? 'application/json' : 'text/markdown'}\r\n\r\n` +
              content +
              `\r\n--foo_bar_baz--`;

            const response = await window.gapi.client.request({
              path: '/upload/drive/v3/files',
              method: 'POST',
              params: { 
                uploadType: 'multipart',
                supportsAllDrives: true
              },
              headers: {
                'Content-Type': 'multipart/related; boundary=foo_bar_baz',
              },
              body: multipartRequestBody,
            });
            const newFile = response.result;
            console.log(`[GoogleDrive] Created file ${newFile.id}`);
            this.fileCache.set(path, { id: newFile.id, name: path });
        }
    } catch (e) {
      console.error('Error writing file', e);
      if ((e as any).status === 401) {
        this.accessToken = null;
        throw this.createAuthRequiredError('Google Drive session expired. Please reconnect.');
      }
      if ((e as any).status === 403) {
        console.error('Permission denied. User might need to grant write access.');
        alert('Permission denied! Please ensure you have granted the app full Drive access. You may need to sign out and sign in again to update permissions.');
      }
      throw e;
    } finally {
        this.writeLocks.delete(path);
        unlock!();
    }
  }

  async writeWithMeta(
    path: string,
    content: string,
    options?: { ifMatch?: string }
  ): Promise<{ meta?: FileMeta }> {
    // Serialize writes to the same path to prevent race conditions (duplicates)
    while (this.writeLocks.has(path)) {
        try {
            await this.writeLocks.get(path);
        } catch {
            // Ignore errors from previous writes
        }
    }

    let unlock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
        unlock = resolve;
    });
    this.writeLocks.set(path, lockPromise);

    try {
      // Writes should not trigger OAuth UI automatically.
      await this.ensureAuth({ interactive: false });
        await this.ensureDriveApi();

        const fileId = await this.findFileId(path);
        
        const metadata: any = {
          name: path,
          mimeType: 'text/markdown',
        };
        if (!fileId && this.config?.rootFolderId) {
          metadata.parents = [this.config.rootFolderId];
        }

        if (fileId) {
            const headers: Record<string, string> = {
              'Content-Type': 'text/markdown',
            };
            if (options?.ifMatch) headers['If-Match'] = options.ifMatch;

            const response = await window.gapi.client.request({
              path: `/upload/drive/v3/files/${fileId}`,
              method: 'PATCH',
              params: {
                uploadType: 'media',
                supportsAllDrives: true
              },
              headers,
              body: content,
            });

            const etagHeader = (response as any)?.headers?.etag || (response as any)?.headers?.ETag;
            return { meta: { etag: etagHeader } };
        }

        const multipartRequestBody =
            `\r\n--foo_bar_baz\r\n` +
            `Content-Type: application/json\r\n\r\n` +
            JSON.stringify(metadata) +
            `\r\n--foo_bar_baz\r\n` +
            `Content-Type: text/markdown\r\n\r\n` +
            content +
            `\r\n--foo_bar_baz--`;

        const response = await window.gapi.client.request({
            path: '/upload/drive/v3/files',
            method: 'POST',
            params: {
              uploadType: 'multipart',
              supportsAllDrives: true
            },
            headers: {
              'Content-Type': 'multipart/related; boundary=foo_bar_baz',
            },
            body: multipartRequestBody,
        });

        const newFile = response.result;
        if (newFile?.id) this.fileCache.set(path, { id: newFile.id, name: path });

        const etagHeader = (response as any)?.headers?.etag || (response as any)?.headers?.ETag;
        return { meta: { etag: etagHeader } };
    } catch (e) {
      console.error('Error writing file (with meta)', e);
      if ((e as any).status === 401) {
        this.accessToken = null;
        throw this.createAuthRequiredError('Google Drive session expired. Please reconnect.');
      }

      // 412: precondition failed (ETag mismatch) => conflict
      if ((e as any).status === 412) {
        const conflict = new Error('Conflict: remote file changed');
        (conflict as any).code = 'conflict';
        throw conflict;
      }

      if ((e as any).status === 403) {
        console.error('Permission denied. User might need to grant write access.');
        alert('Permission denied! Please ensure you have granted the app full Drive access. You may need to sign out and sign in again to update permissions.');
      }
      throw e;
    } finally {
        this.writeLocks.delete(path);
        unlock!();
    }
  }

  async pickFolder(): Promise<string | null> {
    console.log('pickFolder: Starting...');
    try {
      await this.ensureAuth({ interactive: true });
      console.log('pickFolder: Auth ensured');
    } catch (e) {
      console.error('pickFolder: Auth failed', e);
      throw e;
    }
    
    return new Promise((resolve, reject) => {
      if (!window.google || !window.google.picker) {
        console.error('pickFolder: window.google.picker not found. Is Google Picker API enabled?');
        reject(new Error('Google Picker API not loaded'));
        return;
      }

      try {
        let loaded = false;
        const loadTimeoutId = window.setTimeout(() => {
          if (loaded) return;
          reject(
            new Error(
              'google_picker_load_timeout: Picker failed to load. Common causes: API key HTTP referrer restrictions (add http://localhost:5173/*), Picker API not enabled, or third-party cookies blocked.'
            )
          );
        }, 15000);

        const pickerCallback = (data: any) => {
          if (data.action === window.google.picker.Action.LOADED) {
            loaded = true;
            window.clearTimeout(loadTimeoutId);
            return;
          }

          if (data.action === 'error') {
            window.clearTimeout(loadTimeoutId);
            reject(new Error('google_picker_error'));
            return;
          }

          if (data.action === window.google.picker.Action.PICKED) {
            window.clearTimeout(loadTimeoutId);
            const doc = data.docs[0];
            console.log('pickFolder: Folder picked', doc);
            resolve(doc.id);
          } else if (data.action === window.google.picker.Action.CANCEL) {
            window.clearTimeout(loadTimeoutId);
            console.log('pickFolder: Cancelled');
            resolve(null);
          }
        };

          // Use DOCS view but configured for folders - this is often more reliable than FOLDERS view
          const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
            .setMimeTypes('application/vnd.google-apps.folder');

          const pickerBuilder = new window.google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(this.accessToken)
            .setDeveloperKey(this.config!.apiKey)
            .setOrigin(window.location.origin)
            .setCallback(pickerCallback)
          const appId = this.getPickerAppId();
          if (appId) pickerBuilder.setAppId(appId);

          const picker = pickerBuilder.build();

          picker.setVisible(true);
          console.log('pickFolder: Picker set to visible');
        } catch (err) {
          console.error('pickFolder: Error building/showing picker', err);
          reject(err);
        }
    });
  }

  async pickFile(): Promise<{ id: string; name: string } | null> {
    console.log('pickFile: Starting...');
    try {
      await this.ensureAuth({ interactive: true });
    } catch (e) {
      console.error('pickFile: Auth failed', e);
      throw e;
    }
    
    return new Promise((resolve, reject) => {
      if (!window.google || !window.google.picker) {
        reject(new Error('Google Picker API not loaded'));
        return;
      }

      try {
        let loaded = false;
        const loadTimeoutId = window.setTimeout(() => {
          if (loaded) return;
          reject(
            new Error(
              'google_picker_load_timeout: Picker failed to load. Common causes: API key HTTP referrer restrictions (add http://localhost:5173/*), Picker API not enabled, or third-party cookies blocked.'
            )
          );
        }, 15000);

        const pickerCallback = (data: any) => {
          if (data.action === window.google.picker.Action.LOADED) {
            loaded = true;
            window.clearTimeout(loadTimeoutId);
            return;
          }

          if (data.action === 'error') {
            window.clearTimeout(loadTimeoutId);
            reject(new Error('google_picker_error'));
            return;
          }

          if (data.action === window.google.picker.Action.PICKED) {
            window.clearTimeout(loadTimeoutId);
            const doc = data.docs[0];
            console.log('pickFile: File picked', doc.id);
            // Update cache with the picked file ID to ensure subsequent operations use it
            this.fileCache.set(doc.name, { id: doc.id, name: doc.name });
            resolve({ id: doc.id, name: doc.name });
          } else if (data.action === window.google.picker.Action.CANCEL) {
            window.clearTimeout(loadTimeoutId);
            resolve(null);
          }
        };

          const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
            .setIncludeFolders(true)
            .setMimeTypes('text/markdown,text/plain');

          const pickerBuilder = new window.google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(this.accessToken)
            .setDeveloperKey(this.config!.apiKey)
            .setOrigin(window.location.origin)
            .setCallback(pickerCallback)

          const appId = this.getPickerAppId();
          if (appId) pickerBuilder.setAppId(appId);

          const picker = pickerBuilder.build();

          picker.setVisible(true);
        } catch (err) {
          reject(err);
        }
    });
  }

  async pickFiles(): Promise<{ id: string; name: string }[]> {
    console.log('pickFiles: Starting...');
    try {
      await this.ensureAuth({ interactive: true });
    } catch (e) {
      console.error('pickFiles: Auth failed', e);
      throw e;
    }
    
    return new Promise((resolve, reject) => {
      if (!window.google || !window.google.picker) {
        reject(new Error('Google Picker API not loaded'));
        return;
      }

      try {
        let loaded = false;
        const loadTimeoutId = window.setTimeout(() => {
          if (loaded) return;
          reject(
            new Error(
              'google_picker_load_timeout: Picker failed to load. Common causes: API key HTTP referrer restrictions (add http://localhost:5173/*), Picker API not enabled, or third-party cookies blocked.'
            )
          );
        }, 15000);

        const pickerCallback = (data: any) => {
          if (data.action === window.google.picker.Action.LOADED) {
            loaded = true;
            window.clearTimeout(loadTimeoutId);
            return;
          }

          if (data.action === 'error') {
            window.clearTimeout(loadTimeoutId);
            reject(new Error('google_picker_error'));
            return;
          }

          if (data.action === window.google.picker.Action.PICKED) {
            window.clearTimeout(loadTimeoutId);
            const docs = data.docs;
            console.log('pickFiles: Files picked', docs.length);
            const results = docs.map((doc: any) => {
              // Update cache
              this.fileCache.set(doc.name, { id: doc.id, name: doc.name });
              return { id: doc.id, name: doc.name };
            });
            resolve(results);
          } else if (data.action === window.google.picker.Action.CANCEL) {
            window.clearTimeout(loadTimeoutId);
            resolve([]);
          }
        };

          const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
            .setIncludeFolders(true)
            .setMimeTypes('text/markdown,text/plain');

          const pickerBuilder = new window.google.picker.PickerBuilder()
            .addView(view)
            .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
            .setOAuthToken(this.accessToken)
            .setDeveloperKey(this.config!.apiKey)
            .setOrigin(window.location.origin)
            .setCallback(pickerCallback)

          const appId = this.getPickerAppId();
          if (appId) pickerBuilder.setAppId(appId);

          const picker = pickerBuilder.build();

          picker.setVisible(true);
        } catch (err) {
          console.error('pickFiles: Error building/showing picker', err);
          reject(err);
        }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async rename(_oldName: string, _newName: string): Promise<void> {
    console.warn('Rename not implemented for Google Drive adapter yet');
    throw new Error('Rename not supported in Google Drive mode yet');
  }
}
