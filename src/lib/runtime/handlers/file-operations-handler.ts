import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import type { StorageProvider } from "@/lib/storage/storage-provider";

const DEFAULT_OUTPUT_VARIABLE = "file_result";
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/**
 * file_operations — Cloud storage operations (S3 / Google Drive / base64).
 */
export const fileOperationsHandler: NodeHandler = async (node, context) => {
  const operation = (node.data.operation as string) ?? "read";
  const provider = (node.data.provider as string) ?? "s3";
  const path = resolveTemplate(
    (node.data.path as string) ?? "",
    context.variables,
  );
  const contentVariable = (node.data.contentVariable as string) ?? "";
  const bucket =
    (node.data.bucket as string) || process.env.AWS_S3_BUCKET || "";
  const contentType = (node.data.contentType as string) ?? "application/octet-stream";
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;

  if (!path && provider !== "base64") {
    return {
      messages: [
        { role: "assistant", content: "File Operations node has no path configured." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  try {
    if (provider === "base64") {
      return handleBase64(operation, path, contentVariable, outputVariable, context);
    }

    const storageClient = await getStorageProvider(provider, bucket, context.variables);

    switch (operation) {
      case "read": {
        const result = await storageClient.read(path);
        if (result.size > MAX_FILE_SIZE) {
          return errorResult(outputVariable, context, "File exceeds 100MB limit");
        }
        return {
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            ...context.variables,
            [outputVariable]: result,
          },
        };
      }

      case "write": {
        const content = contentVariable
          ? String(context.variables[contentVariable] ?? "")
          : "";
        const result = await storageClient.write(path, content, contentType);
        return {
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            ...context.variables,
            [outputVariable]: result,
          },
        };
      }

      case "list": {
        const files = await storageClient.list(path);
        return {
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            ...context.variables,
            [outputVariable]: { files },
          },
        };
      }

      case "delete": {
        await storageClient.remove(path);
        return {
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            ...context.variables,
            [`${outputVariable}_status`]: "deleted",
          },
        };
      }

      case "presigned_url": {
        const result = await storageClient.presignedUrl(path, 3600);
        return {
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            ...context.variables,
            [outputVariable]: result,
          },
        };
      }

      default:
        return errorResult(outputVariable, context, `Unknown operation: ${operation}`);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return errorResult(outputVariable, context, errorMsg);
  }
};

function handleBase64(
  operation: string,
  path: string,
  contentVariable: string,
  outputVariable: string,
  context: Parameters<NodeHandler>[1],
): ReturnType<NodeHandler> {
  if (operation === "read") {
    const content = String(context.variables[path] ?? "");
    return Promise.resolve({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: {
          content,
          contentType: "application/octet-stream",
          size: content.length,
        },
      },
    });
  }

  if (operation === "write") {
    const content = contentVariable
      ? String(context.variables[contentVariable] ?? "")
      : "";
    return Promise.resolve({
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [path]: content,
        [`${outputVariable}_status`]: "stored",
      },
    });
  }

  return Promise.resolve({
    messages: [
      { role: "assistant", content: `base64 provider only supports read/write, not ${operation}` },
    ],
    nextNodeId: null,
    waitForInput: false,
  });
}

async function getStorageProvider(
  provider: string,
  bucket: string,
  variables: Record<string, unknown>,
): Promise<StorageProvider> {
  if (provider === "gdrive") {
    const accessToken = String(variables.__gdrive_token ?? "");
    if (!accessToken) throw new Error("Google Drive access token not available");
    const { createGDriveProvider } = await import("@/lib/storage/gdrive-provider");
    return createGDriveProvider(accessToken);
  }

  if (!process.env.AWS_ACCESS_KEY_ID) {
    throw new Error("AWS_ACCESS_KEY_ID is required for S3 operations");
  }

  const { createS3Provider } = await import("@/lib/storage/s3-provider");
  return createS3Provider(bucket);
}

function errorResult(
  outputVariable: string,
  context: Parameters<NodeHandler>[1],
  message: string,
): ReturnType<NodeHandler> {
  return Promise.resolve({
    messages: [],
    nextNodeId: null,
    waitForInput: false,
    updatedVariables: {
      ...context.variables,
      [outputVariable]: `[Error: ${message}]`,
    },
  });
}
