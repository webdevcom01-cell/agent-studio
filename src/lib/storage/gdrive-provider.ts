import type {
  StorageProvider,
  ReadResult,
  WriteResult,
  StorageFile,
  PresignedUrlResult,
} from "./storage-provider";
import { logger } from "@/lib/logger";

export function createGDriveProvider(accessToken: string): StorageProvider {
  const BASE_URL = "https://www.googleapis.com";

  async function apiRequest(url: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...init?.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Google Drive API error ${response.status}`);
    }
    return response;
  }

  return {
    async read(fileId: string): Promise<ReadResult> {
      const metaRes = await apiRequest(
        `${BASE_URL}/drive/v3/files/${fileId}?fields=name,mimeType,size`,
      );
      const meta = (await metaRes.json()) as {
        mimeType?: string;
        size?: string;
      };

      const contentRes = await apiRequest(
        `${BASE_URL}/drive/v3/files/${fileId}?alt=media`,
      );
      const buffer = Buffer.from(await contentRes.arrayBuffer());

      return {
        content: buffer.toString("base64"),
        contentType: meta.mimeType ?? "application/octet-stream",
        size: Number(meta.size ?? buffer.length),
      };
    },

    async write(fileName: string, content: string, contentType: string): Promise<WriteResult> {
      const metadata = JSON.stringify({ name: fileName });
      const boundary = "agent_studio_boundary";

      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        metadata,
        `--${boundary}`,
        `Content-Type: ${contentType}`,
        "Content-Transfer-Encoding: base64",
        "",
        content,
        `--${boundary}--`,
      ].join("\r\n");

      const res = await apiRequest(
        `${BASE_URL}/upload/drive/v3/files?uploadType=multipart`,
        {
          method: "POST",
          headers: {
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        },
      );

      const data = (await res.json()) as { id?: string };
      logger.info("Google Drive file uploaded", { fileId: data.id });

      return {
        url: data.id
          ? `https://drive.google.com/file/d/${data.id}/view`
          : null,
        key: data.id ?? fileName,
      };
    },

    async list(query: string): Promise<StorageFile[]> {
      const q = query
        ? `name contains '${query.replace(/'/g, "\\'")}'`
        : "";
      const params = new URLSearchParams({
        q: q || "trashed = false",
        fields: "files(id,name,size,modifiedTime,mimeType)",
        pageSize: "100",
      });

      const res = await apiRequest(
        `${BASE_URL}/drive/v3/files?${params.toString()}`,
      );
      const data = (await res.json()) as {
        files?: {
          name?: string;
          size?: string;
          modifiedTime?: string;
          mimeType?: string;
        }[];
      };

      return (data.files ?? []).map((f) => ({
        name: f.name ?? "",
        size: Number(f.size ?? 0),
        lastModified: f.modifiedTime ?? null,
        contentType: f.mimeType ?? null,
      }));
    },

    async remove(fileId: string): Promise<void> {
      await apiRequest(`${BASE_URL}/drive/v3/files/${fileId}`, {
        method: "DELETE",
      });
    },

    async presignedUrl(fileId: string, _expiresInSeconds: number): Promise<PresignedUrlResult> {
      return {
        url: `https://drive.google.com/uc?export=download&id=${fileId}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      };
    },
  };
}
