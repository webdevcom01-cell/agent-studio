import type {
  StorageProvider,
  ReadResult,
  WriteResult,
  StorageFile,
  PresignedUrlResult,
} from "./storage-provider";

export function createS3Provider(bucket: string): StorageProvider {
  const region = process.env.AWS_REGION ?? "eu-west-1";

  async function getClient() {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
      },
    });
  }

  return {
    async read(path: string): Promise<ReadResult> {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await getClient();
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: path }),
      );
      const body = await response.Body?.transformToString("base64");
      return {
        content: body ?? "",
        contentType: response.ContentType ?? "application/octet-stream",
        size: response.ContentLength ?? 0,
      };
    },

    async write(path: string, content: string, contentType: string): Promise<WriteResult> {
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await getClient();
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: path,
          Body: Buffer.from(content, "base64"),
          ContentType: contentType,
        }),
      );
      return {
        url: `https://${bucket}.s3.${region}.amazonaws.com/${path}`,
        key: path,
      };
    },

    async list(prefix: string): Promise<StorageFile[]> {
      const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
      const client = await getClient();
      const response = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 100 }),
      );
      return (response.Contents ?? []).map((obj) => ({
        name: obj.Key ?? "",
        size: obj.Size ?? 0,
        lastModified: obj.LastModified?.toISOString() ?? null,
        contentType: null,
      }));
    },

    async remove(path: string): Promise<void> {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await getClient();
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: path }),
      );
    },

    async presignedUrl(path: string, expiresInSeconds: number): Promise<PresignedUrlResult> {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
      const client = await getClient();
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: path }),
        { expiresIn: expiresInSeconds },
      );
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
      return { url, expiresAt };
    },
  };
}
