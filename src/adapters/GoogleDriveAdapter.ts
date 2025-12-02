import type { StorageProvider } from './StorageProvider';

export interface GoogleDriveConfig {
  clientId: string;
  apiKey: string;
  rootFolderId?: string;
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
  private isInitialized = false;
  private fileCache: Map<string, { id: string; name: string }> = new Map();

  private driveApiLoaded = false;

  constructor() {
    const savedConfig = localStorage.getItem('google-drive-config');
    if (savedConfig) {
      this.config = JSON.parse(savedConfig);
    } else {
      // Try to load from environment variables
      const envClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      const envApiKey = import.meta.env.VITE_GOOGLE_API_KEY;
      
      if (envClientId && envApiKey) {
        this.config = {
          clientId: envClientId,
          apiKey: envApiKey
        };
      }
    }
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
            // Use only drive.file scope. This is "Sensitive" but not "Restricted".
            // The Picker handles the "open" permission grant for selected folders.
            scope: 'https://www.googleapis.com/auth/drive.file',
            callback: (response: any) => {
              if (response.error !== undefined) {
                throw response;
              }
              this.accessToken = response.access_token;
            },
          });

          this.isInitialized = true;
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
      this.tokenClient.callback = (resp: any) => {
        if (resp.error !== undefined) {
          throw resp;
        }
        this.accessToken = resp.access_token;
        resolve();
      };
      // Don't force consent every time. This allows silent sign-in if already authorized.
      this.tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  private async ensureAuth() {
    if (!this.accessToken) {
      await this.signIn();
    }
  }

  async list(path: string): Promise<string[]> {
    await this.ensureAuth();
    await this.ensureDriveApi();
    
    // List markdown files
    // We'll look for files with .md extension or markdown mime type
    // We are using 'drive.file' scope, so we only see files created by this app
    // or files opened with this app.
    try {
      let query = "(name contains '.md' or name contains '.markdown') and trashed = false";
      if (this.config?.rootFolderId) {
        query = `'${this.config.rootFolderId}' in parents and ${query}`;
      }

      const response = await window.gapi.client.drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      const files = response.result.files;
      this.fileCache.clear();
      
      if (files && files.length > 0) {
        const uniqueFiles = new Set<string>();
        const result: string[] = [];
        
        files.forEach((f: any) => {
          if (!uniqueFiles.has(f.name)) {
            uniqueFiles.add(f.name);
            this.fileCache.set(f.name, { id: f.id, name: f.name });
            result.push(f.name);
          }
        });
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
    
    let fileId = this.fileCache.get(path)?.id;

    if (!fileId) {
      // Try to find it if not in cache
      let query = `name = '${path}' and trashed = false`;
      if (this.config?.rootFolderId) {
        query = `'${this.config.rootFolderId}' in parents and ${query}`;
      }

      const response = await window.gapi.client.drive.files.list({
        q: query,
        fields: 'files(id, name)',
      });
      if (response.result.files && response.result.files.length > 0) {
        fileId = response.result.files[0].id;
        if (fileId) {
          this.fileCache.set(path, { id: fileId, name: path });
        }
      }
    }

    if (!fileId) return null;

    try {
      const response = await window.gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media',
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

  async write(path: string, content: string): Promise<void> {
    await this.ensureAuth();
    await this.ensureDriveApi();

    let fileId = this.fileCache.get(path)?.id;

    if (!fileId) {
       // Check if exists first
       let query = `name = '${path}' and trashed = false`;
       if (this.config?.rootFolderId) {
         query = `'${this.config.rootFolderId}' in parents and ${query}`;
       }

       const listResp = await window.gapi.client.drive.files.list({
        q: query,
        fields: 'files(id, name)',
      });
      if (listResp.result.files && listResp.result.files.length > 0) {
        fileId = listResp.result.files[0].id;
        if (fileId) {
          this.fileCache.set(path, { id: fileId, name: path });
        }
      }
    }

    const metadata: any = {
      name: path,
      mimeType: 'text/markdown',
    };

    // Only set parents on creation, not update.
    // Updating parents via PATCH metadata is often restricted (fieldNotWritable).
    if (!fileId && this.config?.rootFolderId) {
      metadata.parents = [this.config.rootFolderId];
    }

    const multipartRequestBody =
      `\r\n--foo_bar_baz\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--foo_bar_baz\r\n` +
      `Content-Type: text/markdown\r\n\r\n` +
      content +
      `\r\n--foo_bar_baz--`;

    try {
      if (fileId) {
        // Update
        await window.gapi.client.request({
          path: `/upload/drive/v3/files/${fileId}`,
          method: 'PATCH',
          params: { uploadType: 'multipart' },
          headers: {
            'Content-Type': 'multipart/related; boundary=foo_bar_baz',
          },
          body: multipartRequestBody,
        });
      } else {
        // Create
        const response = await window.gapi.client.request({
          path: '/upload/drive/v3/files',
          method: 'POST',
          params: { uploadType: 'multipart' },
          headers: {
            'Content-Type': 'multipart/related; boundary=foo_bar_baz',
          },
          body: multipartRequestBody,
        });
        const newFile = response.result;
        this.fileCache.set(path, { id: newFile.id, name: path });
      }
    } catch (e) {
      console.error('Error writing file', e);
      if ((e as any).status === 401) {
        console.log('Token expired during write, refreshing...');
        this.accessToken = null;
        await this.signIn();
        return this.write(path, content);
      }
      throw e;
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
              console.log('pickFolder: Folder picked', doc.id);
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
}
