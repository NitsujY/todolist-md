import type { StorageProvider } from './StorageProvider';

export interface GoogleDriveConfig {
  clientId: string;
  apiKey: string;
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

  constructor() {
    const savedConfig = localStorage.getItem('google-drive-config');
    if (savedConfig) {
      this.config = JSON.parse(savedConfig);
    }
  }

  setConfig(config: GoogleDriveConfig) {
    this.config = config;
    localStorage.setItem('google-drive-config', JSON.stringify(config));
    this.isInitialized = false; // Force re-init
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
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({
            apiKey: this.config!.apiKey,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
          });

          this.tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: this.config!.clientId,
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
          reject(err);
        }
      });
    });
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
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }

  private async ensureAuth() {
    if (!this.accessToken) {
      await this.signIn();
    }
  }

  async list(path: string): Promise<string[]> {
    await this.ensureAuth();
    
    // List markdown files
    // We'll look for files with .md extension or markdown mime type
    // We are using 'drive.file' scope, so we only see files created by this app
    // or files opened with this app.
    try {
      const response = await window.gapi.client.drive.files.list({
        q: "(name contains '.md' or name contains '.markdown') and trashed = false",
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      const files = response.result.files;
      this.fileCache.clear();
      
      if (files && files.length > 0) {
        return files.map((f: any) => {
          this.fileCache.set(f.name, { id: f.id, name: f.name });
          return f.name;
        });
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
    
    let fileId = this.fileCache.get(path)?.id;

    if (!fileId) {
      // Try to find it if not in cache
      const response = await window.gapi.client.drive.files.list({
        q: `name = '${path}' and trashed = false`,
        fields: 'files(id, name)',
      });
      if (response.result.files && response.result.files.length > 0) {
        fileId = response.result.files[0].id;
        this.fileCache.set(path, { id: fileId, name: path });
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
      return null;
    }
  }

  async write(path: string, content: string): Promise<void> {
    await this.ensureAuth();

    let fileId = this.fileCache.get(path)?.id;

    if (!fileId) {
       // Check if exists first
       const listResp = await window.gapi.client.drive.files.list({
        q: `name = '${path}' and trashed = false`,
        fields: 'files(id, name)',
      });
      if (listResp.result.files && listResp.result.files.length > 0) {
        fileId = listResp.result.files[0].id;
        this.fileCache.set(path, { id: fileId, name: path });
      }
    }

    const metadata = {
      name: path,
      mimeType: 'text/markdown',
    };

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
      throw e;
    }
  }
}
