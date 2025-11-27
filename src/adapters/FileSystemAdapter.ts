import type { StorageProvider } from './StorageProvider';

export class FileSystemAdapter implements StorageProvider {
  private fileHandle: FileSystemFileHandle | null = null;
  private dirHandle: FileSystemDirectoryHandle | null = null;

  async openFile(): Promise<boolean> {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{
          description: 'Markdown Files',
          accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] },
        }],
        multiple: false,
      });
      this.fileHandle = handle;
      this.dirHandle = null;
      return true;
    } catch (err) {
      console.error('User cancelled file picker', err);
      return false;
    }
  }

  async openDirectory(): Promise<boolean> {
    try {
      const handle = await (window as any).showDirectoryPicker();
      this.dirHandle = handle;
      this.fileHandle = null;
      return true;
    } catch (err) {
      console.error('User cancelled directory picker', err);
      return false;
    }
  }

  async read(filename: string): Promise<string | null> {
    // If we have a direct file handle and no filename is specified (or it matches), use it
    if (this.fileHandle && (!filename || filename === this.fileHandle.name)) {
      const file = await this.fileHandle.getFile();
      return await file.text();
    }

    // If we have a directory handle, try to find the file
    if (this.dirHandle) {
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
      handle = await this.dirHandle.getFileHandle(filename, { create: true });
    }

    if (!handle) {
      throw new Error('No file selected');
    }

    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async list(_path: string): Promise<string[]> {
    if (!this.dirHandle) return [];
    
    const files: string[] = [];
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
      await (this.dirHandle as any).removeEntry(oldName);
    } catch (e) {
      console.error('Rename failed', e);
      throw e;
    }
  }
}
