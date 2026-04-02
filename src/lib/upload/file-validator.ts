/**
 * File Upload Validator — magic number + extension verification.
 *
 * Validates that the actual file content matches the declared MIME type.
 * Prevents extension spoofing attacks (e.g., .exe renamed to .pdf).
 */

import { logger } from "@/lib/logger";

interface ValidationResult {
  valid: boolean;
  detectedType: string | null;
  reason?: string;
}

const ALLOWED_TYPES: Record<string, { magic: number[]; extensions: string[] }> = {
  "application/pdf": {
    magic: [0x25, 0x50, 0x44, 0x46], // %PDF
    extensions: [".pdf"],
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    magic: [0x50, 0x4b, 0x03, 0x04], // PK (ZIP-based)
    extensions: [".docx"],
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    magic: [0x50, 0x4b, 0x03, 0x04], // PK (ZIP-based)
    extensions: [".xlsx"],
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    magic: [0x50, 0x4b, 0x03, 0x04], // PK (ZIP-based)
    extensions: [".pptx"],
  },
  "text/plain": {
    magic: [], // No magic number for text
    extensions: [".txt", ".md", ".csv"],
  },
  "text/html": {
    magic: [], // Variable
    extensions: [".html", ".htm"],
  },
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function validateFileUpload(
  buffer: Buffer,
  filename: string,
  declaredMime: string,
): ValidationResult {
  // Size check
  if (buffer.length > MAX_FILE_SIZE) {
    return {
      valid: false,
      detectedType: null,
      reason: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
    };
  }

  // Extension check
  const ext = getExtension(filename);
  const typeConfig = ALLOWED_TYPES[declaredMime];

  if (!typeConfig) {
    return {
      valid: false,
      detectedType: declaredMime,
      reason: `MIME type "${declaredMime}" is not allowed`,
    };
  }

  if (typeConfig.extensions.length > 0 && !typeConfig.extensions.includes(ext)) {
    return {
      valid: false,
      detectedType: declaredMime,
      reason: `Extension "${ext}" does not match MIME type "${declaredMime}"`,
    };
  }

  // Magic number check (skip for text types)
  if (typeConfig.magic.length > 0) {
    const header = Array.from(buffer.subarray(0, typeConfig.magic.length));
    const matches = typeConfig.magic.every((byte, i) => header[i] === byte);

    if (!matches) {
      logger.warn("File magic number mismatch", {
        filename,
        declaredMime,
        expectedMagic: typeConfig.magic.map((b) => b.toString(16)).join(" "),
        actualMagic: header.map((b) => b.toString(16)).join(" "),
      });

      return {
        valid: false,
        detectedType: null,
        reason: "File content does not match declared type (magic number mismatch)",
      };
    }
  }

  return { valid: true, detectedType: declaredMime };
}

function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

export { MAX_FILE_SIZE, ALLOWED_TYPES };
