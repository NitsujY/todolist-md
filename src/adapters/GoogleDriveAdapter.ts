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
  private userEmail: string | null = null;
  private isInitialized = false;
  private fileCache: Map<string, { id: string; name: string }> = new Map();
  private writeLocks = new Map<string, Promise<void>>();

  private driveApiLoaded = false;

  constructor() {
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
    this.userEmail = localStorage.getItem('google-drive-user-email');

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
    if (!this.config) throw new Error('Google Drive config not set');
    if (!this.config.clientId) throw new Error('Google Drive Client ID is missing. Please configure it in Settings.');
    if (!this.config.apiKey) throw new Error('Google Drive API Key is missing. Please configure it in Settings.');

    await this.loadScripts();

    return new Promise((resolve, reject) => {
      // Load both client and picker libraries
      window.gapi.load('client:picker', async () => {
        try {
          console.log('Initializing GAPI client...');
          // Minimal init - just API key, no discovery docs yet to avoid 502s
          await window.gapi.client.init({
            apiKey: this.config!.apiKey,
          });
          console.log('GAPI client initialized (minimal)');

          this.tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: this.config!.clientId,
            // Use 'drive.file' scope as required by Google for verification.
            // This means we only see files we created or opened via Picker.
            // Add userinfo.email to help with silent sign-in hints
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.install https://www.googleapis.com/auth/userinfo.email',
            callback: (response: TokenResponse) => {
              if (response.error !== undefined) {
                throw response;
              }
              this.handleTokenResponse(response);
            },
          });

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
  }

  private async ensureDriveApi() {
    if (this.driveApiLoaded) return;
    
    console.log('Loading Drive API...');
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
  }

  async signIn(): Promise<void> {
    if (!this.isInitialized) await this.init();
    
    return new Promise((resolve) => {
      this.tokenClient.callback = (resp: TokenResponse) => {
        if (resp.error !== undefined) {
          throw resp;
        }
        this.handleTokenResponse(resp);
        resolve();
      };
      // Don't force consent every time. This allows silent sign-in if already authorized.
      // Use login_hint to help skip account chooser if we know the email
      const config: any = { prompt: '' };
      if (this.userEmail) {
        config.login_hint = this.userEmail;
      }
      this.tokenClient.requestAccessToken(config);
    });
  }

  async switchAccount(): Promise<void> {
    if (!this.isInitialized) await this.init();
    
    return new Promise((resolve) => {
      this.tokenClient.callback = (resp: TokenResponse) => {
        if (resp.error !== undefined) {
          throw resp;
        }
        this.handleTokenResponse(resp);
        resolve();
      };
      // Force account selection
      this.tokenClient.requestAccessToken({ prompt: 'select_account' });
    });
  }
  private handleTokenResponse(resp: TokenResponse) {
    this.accessToken = resp.access_token;
    // expires_in is in seconds. Subtract a buffer (e.g. 5 mins) to be safe.
    const expiresIn = parseInt(resp.expires_in, 10);
    this.tokenExpiration = Date.now() + (expiresIn - 300) * 1000;
    
    localStorage.setItem('google-drive-token', this.accessToken!);
    localStorage.setItem('google-drive-token-expires', this.tokenExpiration.toString());

    // Fetch user info if we don't have it yet
    if (!this.userEmail) {
      this.fetchUserInfo();
    }
  }

  private async fetchUserInfo() {
    try {
      // Ensure gapi client has the token
      if (this.accessToken && window.gapi && window.gapi.client) {
        window.gapi.client.setToken({ access_token: this.accessToken });
        
        const response = await window.gapi.client.request({
          path: 'https://www.googleapis.com/oauth2/v3/userinfo',
        });
        
        if (response.result && response.result.email) {
          this.userEmail = response.result.email;
          localStorage.setItem('google-drive-user-email', this.userEmail!);
          console.log('Fetched user email:', this.userEmail);
        }
      }
    } catch (e) {
      console.error('Failed to fetch user info', e);
    }
  }

  private async ensureAuth() {
    if (!this.isInitialized) {
      await this.init();
    }
    if (!this.accessToken || Date.now() >= this.tokenExpiration) {
      await this.signIn();
    }

    // Ensure gapi client has the token for requests
    if (this.accessToken && window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: this.accessToken });
    }
  }

  private async findFileId(path: string): Promise<string | null> {
    // 1. Check cache
    const cached = this.fileCache.get(path);
    if (cached) return cached.id;

    await this.ensureAuth();
    await this.ensureDriveApi();

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

  async list(path: string): Promise<string[]> {
    await this.ensureAuth();
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
      this.fileCache.clear();
      
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
      // If token expired
      if ((e as any).status === 401) {
        this.accessToken = null;
        await this.signIn();
        return this.list(path);
      }
      return [];
    }
  }

  async read(path: string): Promise<string | null> {
    await this.ensureAuth();
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
      if ((e as any).status === 401) {
        console.log('Token expired during read, refreshing...');
        this.accessToken = null;
        await this.signIn();
        return this.read(path);
      }
      return null;
    }
  }

  async readWithMeta(path: string): Promise<{ content: string | null; meta?: FileMeta }> {
    await this.ensureAuth();
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
      if ((e as any).status === 401) {
        console.log('Token expired during read, refreshing...');
        this.accessToken = null;
        await this.signIn();
        return this.readWithMeta(path);
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
        await this.ensureAuth();
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
        console.log('Token expired during write, refreshing...');
        this.accessToken = null;
        await this.signIn();
        // Recursive call - we need to be careful about locks here.
        // Since we are inside the lock, we can't just call this.write() again because it will wait for itself.
        // We need to release the lock and retry.
        // BUT, if we release, another write might sneak in.
        // Actually, if we fail, we should throw or retry *inside* the lock.
        // Let's just throw for now and let the caller retry, or handle the retry logic without recursion.
        // For simplicity in this patch, we'll just release and throw.
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
        await this.ensureAuth();
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
        console.log('Token expired during write, refreshing...');
        this.accessToken = null;
        await this.signIn();
        // See note in write() about recursion and locks.
        // For now, we just fail.
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
      await this.ensureAuth();
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
        const pickerCallback = (data: any) => {
            if (data.action === window.google.picker.Action.PICKED) {
              const doc = data.docs[0];
              console.log('pickFolder: Folder picked', doc);
              resolve(doc.id);
            } else if (data.action === window.google.picker.Action.CANCEL) {
              console.log('pickFolder: Cancelled');
              resolve(null);
            } else if (data.action === 'error') {
               console.error('pickFolder: Picker Error Action', data);
            } else if (data.action === window.google.picker.Action.LOADED) {
               console.log('pickFolder: Picker UI loaded');
            }
          };

          // Use DOCS view but configured for folders - this is often more reliable than FOLDERS view
          const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
            .setMimeTypes('application/vnd.google-apps.folder');

          const picker = new window.google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(this.accessToken)
            .setDeveloperKey(this.config!.apiKey)
            // .setOrigin(window.location.protocol + '//' + window.location.host) // Sometimes causes issues on localhost
            .setCallback(pickerCallback)
            .build();

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
      await this.ensureAuth();
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
        const pickerCallback = (data: any) => {
            if (data.action === window.google.picker.Action.PICKED) {
              const doc = data.docs[0];
              console.log('pickFile: File picked', doc.id);
              // Update cache with the picked file ID to ensure subsequent operations use it
              this.fileCache.set(doc.name, { id: doc.id, name: doc.name });
              resolve({ id: doc.id, name: doc.name });
            } else if (data.action === window.google.picker.Action.CANCEL) {
              resolve(null);
            }
          };

          const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
            .setIncludeFolders(true)
            .setMimeTypes('text/markdown,text/plain');

          const picker = new window.google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(this.accessToken)
            .setDeveloperKey(this.config!.apiKey)
            .setCallback(pickerCallback)
            .build();

          picker.setVisible(true);
        } catch (err) {
          reject(err);
        }
    });
  }

  async pickFiles(): Promise<{ id: string; name: string }[]> {
    console.log('pickFiles: Starting...');
    try {
      await this.ensureAuth();
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
        const pickerCallback = (data: any) => {
            if (data.action === window.google.picker.Action.PICKED) {
              const docs = data.docs;
              console.log('pickFiles: Files picked', docs.length);
              const results = docs.map((doc: any) => {
                  // Update cache
                  this.fileCache.set(doc.name, { id: doc.id, name: doc.name });
                  return { id: doc.id, name: doc.name };
              });
              resolve(results);
            } else if (data.action === window.google.picker.Action.CANCEL) {
              resolve([]);
            }
          };

          const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
            .setIncludeFolders(true)
            .setMimeTypes('text/markdown,text/plain');

          const picker = new window.google.picker.PickerBuilder()
            .addView(view)
            .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
            .setOAuthToken(this.accessToken)
            .setDeveloperKey(this.config!.apiKey)
            .setCallback(pickerCallback)
            .build();

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
