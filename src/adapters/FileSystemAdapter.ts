import type { StorageProvider } from './StorageProvider';
import { get, set, del } from '../lib/db';

export class FileSystemAdapter implements StorageProvider {
  private fileHandle: FileSystemFileHandle | null = null;
  private dirHandle: FileSystemDirectoryHandle | null = null;

  async openFile(): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{
          description: 'Markdown Files',
          accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] },
        }],
        multiple: false,
      });
      this.fileHandle = handle;
      this.dirHandle = null;
      await set('fileHandle', handle);
      await del('dirHandle');
      return true;
    } catch (err) {
      console.error('User cancelled file picker', err);
      return false;
    }
  }

  async openDirectory(): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle = await (window as any).showDirectoryPicker();
      this.dirHandle = handle;
      this.fileHandle = null;
      await set('dirHandle', handle);
      await del('fileHandle');
      return true;
    } catch (err) {
      console.error('User cancelled directory picker', err);
      return false;
    }
  }

  async read(filename: string): Promise<string | null> {
    // If we have a direct file handle and no filename is specified (or it matches), use it
    if (this.fileHandle && (!filename || filename === this.fileHandle.name)) {
      await this.verifyPermission(this.fileHandle, false);
      const file = await this.fileHandle.getFile();
      return await file.text();
    }

    // If we have a directory handle, try to find the file
    if (this.dirHandle) {
      await this.verifyPermission(this.dirHandle, false);
      try {
        const fileHandle = await this.dirHandle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        return await file.text();
      } catch (e) {
        console.error(`File not found: ${filename}`, e);
        return null;
      }
    }

    return null;
  }

  async write(filename: string, content: string): Promise<void> {
    let handle = this.fileHandle;

    if (this.dirHandle) {
      await this.verifyPermission(this.dirHandle, true);
      handle = await this.dirHandle.getFileHandle(filename, { create: true });
    }

    if (!handle) {
      throw new Error('No file selected');
    }

    await this.verifyPermission(handle, true);
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async list(_path: string): Promise<string[]> {
    if (!this.dirHandle) return [];
    
    await this.verifyPermission(this.dirHandle, false);
    const files: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const entry of (this.dirHandle as any).values()) {
      if (entry.kind === 'file' && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
        files.push(entry.name);
      }
    }
    return files;
  }

  isFolderMode(): boolean {
    return !!this.dirHandle;
  }

  async rename(oldName: string, newName: string): Promise<void> {
    if (!this.dirHandle) throw new Error('Not in folder mode');
    
    try {
      // Get old file
      const oldHandle = await this.dirHandle.getFileHandle(oldName);
      const oldFile = await oldHandle.getFile();
      const content = await oldFile.text();
      
      // Create new file
      const newHandle = await this.dirHandle.getFileHandle(newName, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(content);
      await writable.close();
      
      // Delete old file
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.dirHandle as any).removeEntry(oldName);
    } catch (e) {
      console.error('Rename failed', e);
      throw e;
    }
  }

  async restore(): Promise<'file' | 'folder' | null> {
    const dirHandle = await get('dirHandle');
    if (dirHandle) {
      this.dirHandle = dirHandle;
      return 'folder';
    }
    
    const fileHandle = await get('fileHandle');
    if (fileHandle) {
      this.fileHandle = fileHandle;
      return 'file';
    }
    
    return null;
  }
  private async verifyPermission(handle: FileSystemHandle, readWrite: boolean): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any = {};
    if (readWrite) {
      options.mode = 'readwrite';
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((await (handle as any).queryPermission(options)) === 'granted') {
      return true;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((await (handle as any).requestPermission(options)) === 'granted') {
      return true;
    }
    return false;
  }

  getHandleName(): string {
    return this.dirHandle?.name || this.fileHandle?.name || '';
  }

  async checkPermissionStatus(): Promise<PermissionState> {
    const handle = this.dirHandle || this.fileHandle;
    if (!handle) return 'denied';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (handle as any).queryPermission({ mode: 'readwrite' });
  }

  async requestPermissionAccess(): Promise<boolean> {
    const handle = this.dirHandle || this.fileHandle;
    if (!handle) return false;
    return await this.verifyPermission(handle, true);
  }
}
