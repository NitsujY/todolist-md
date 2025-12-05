import type { StorageProvider } from './StorageProvider';

export class MockCloudAdapter implements StorageProvider {
  private storage: Map<string, string> = new Map();
  private latency = 500; // Simulate network latency

  constructor() {
    // Pre-populate with some data
    this.storage.set('todo.md', '# My Cloud Todo List\n\n- [ ] Task from Cloud 1\n- [x] Task from Cloud 2');
  }

  private delay() {
    return new Promise(resolve => setTimeout(resolve, this.latency));
  }

  async read(path: string): Promise<string | null> {
    await this.delay();
    return this.storage.get(path) || null;
  }

  async write(path: string, content: string): Promise<void> {
    await this.delay();
    this.storage.set(path, content);
    console.log(`[MockCloud] Wrote to ${path}`);
  }

  async list(path: string): Promise<string[]> {
    await this.delay();
    return Array.from(this.storage.keys()).filter(k => k.startsWith(path));
  }

  async rename(oldName: string, newName: string): Promise<void> {
    await this.delay();
    const content = this.storage.get(oldName);
    if (content) {
      this.storage.set(newName, content);
      this.storage.delete(oldName);
      console.log(`[MockCloud] Renamed ${oldName} to ${newName}`);
    } else {
      throw new Error(`File ${oldName} not found`);
    }
  }
}
