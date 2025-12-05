import type { StorageProvider } from './StorageProvider';

export class LocalStorageAdapter implements StorageProvider {
  async read(path: string): Promise<string | null> {
    return localStorage.getItem(path);
  }

  async write(path: string, content: string): Promise<void> {
    localStorage.setItem(path, content);
  }

  async list(path: string): Promise<string[]> {
    // LocalStorage is a flat key-value store, so "path" is treated as a prefix or ignored for this demo.
    // For a real file system simulation, we'd need to store keys with a structure.
    // Here we just return all keys that start with the path (if provided) or all keys.
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(path)) {
        keys.push(key);
      }
    }
    return keys;
  }

  async rename(oldName: string, newName: string): Promise<void> {
    const content = localStorage.getItem(oldName);
    if (content !== null) {
      localStorage.setItem(newName, content);
      localStorage.removeItem(oldName);
    }
  }
}
