
import type { StorageProvider } from './StorageProvider';

export class FileSystemAdapter implements StorageProvider {
  private fileHandle: FileSystemFileHandle | null = null;

  async read(_filename: string): Promise<string | null> {
    if (!this.fileHandle) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'Markdown Files',
              accept: {
                'text/markdown': ['.md', '.markdown'],
                'text/plain': ['.txt'],
              },
            },
          ],
          multiple: false,
        });
        this.fileHandle = handle;
      } catch (err) {
        console.error('User cancelled file picker or API not supported', err);
        return null;
      }
    }

    if (!this.fileHandle) return null;

    const file = await this.fileHandle.getFile();
    return await file.text();
  }

  async write(_filename: string, content: string): Promise<void> {
    if (!this.fileHandle) {
      throw new Error('No file selected');
    }

    const writable = await this.fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async list(_path: string): Promise<string[]> {
    return []; // Not supported for single file mode
  }
}
