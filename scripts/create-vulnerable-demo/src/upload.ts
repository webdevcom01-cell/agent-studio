/**
 * upload.ts — INTENTIONALLY VULNERABLE (for DevOps Swarm demo)
 * Vulnerability: Path Traversal
 * CWE-22: Improper Limitation of a Pathname to a Restricted Directory
 */
import path from "path";
import fs from "fs/promises";

const UPLOAD_DIR = "/uploads";

export async function saveUpload(filename: string, content: Buffer) {
  // ❌ VULNERABLE: No path normalization — allows path traversal
  // e.g. filename = "../../etc/passwd" writes to system files
  const filePath = path.join(UPLOAD_DIR, filename);
  await fs.writeFile(filePath, content);
  return { saved: true, path: filePath };
}

export async function readUpload(filename: string) {
  // ❌ VULNERABLE: Path traversal in read operation
  const filePath = UPLOAD_DIR + "/" + filename;
  const content = await fs.readFile(filePath);
  return content;
}

export function generateTempFilename(originalName: string) {
  // ❌ VULNERABLE: Math.random() is not cryptographically secure
  const randomPart = Math.random().toString(36).substring(2);
  return `${randomPart}_${originalName}`;
}
