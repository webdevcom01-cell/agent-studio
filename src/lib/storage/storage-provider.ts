export interface StorageFile {
  name: string;
  size: number;
  lastModified: string | null;
  contentType: string | null;
}

export interface ReadResult {
  content: string;
  contentType: string;
  size: number;
}

export interface WriteResult {
  url: string | null;
  key: string;
}

export interface PresignedUrlResult {
  url: string;
  expiresAt: string;
}

export interface StorageProvider {
  read(path: string): Promise<ReadResult>;
  write(path: string, content: string, contentType: string): Promise<WriteResult>;
  list(prefix: string): Promise<StorageFile[]>;
  remove(path: string): Promise<void>;
  presignedUrl(path: string, expiresInSeconds: number): Promise<PresignedUrlResult>;
}
