export interface StorageProvider {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  list(path: string): Promise<string[]>;
  rename(oldName: string, newName: string): Promise<void>;

  /**
   * Optional metadata-aware read.
   * Implementations may return version identifiers (e.g., ETag) to support conflict detection.
   */
  readWithMeta?: (
    path: string
  ) => Promise<{
    content: string | null;
    meta?: FileMeta;
  }>;

  /**
   * Optional metadata-aware write.
   * If `ifMatch` is provided, implementations should perform a conditional write and throw on conflict.
   */
  writeWithMeta?: (
    path: string,
    content: string,
    options?: { ifMatch?: string }
  ) => Promise<{
    meta?: FileMeta;
  }>;
}

export type FileMeta = {
  /** Version identifier for conditional writes (e.g., HTTP ETag). */
  etag?: string;
  /** ISO timestamp when available (e.g., Google Drive modifiedTime). */
  modifiedTime?: string;
  /** Monotonic version when available (e.g., Google Drive version). */
  version?: string;
  /** FS file lastModified epoch ms when available. */
  lastModified?: number;
};
