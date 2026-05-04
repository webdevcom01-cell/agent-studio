const MAGIC_SIGNATURES: Record<string, { offset: number; bytes: number[] }[]> = {
  ".pdf":  [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }],
  ".docx": [{ offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04] }],
  ".xlsx": [{ offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04] }],
  ".xls":  [{ offset: 0, bytes: [0xD0, 0xCF, 0x11, 0xE0] }],
  ".pptx": [{ offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04] }],
  ".csv":  [],
};

export function validateMagicBytes(
  buffer: Buffer,
  extension: string,
): { valid: boolean; reason?: string } {
  const sigs = MAGIC_SIGNATURES[extension.toLowerCase()];
  if (!sigs || sigs.length === 0) return { valid: true };

  for (const sig of sigs) {
    if (buffer.length < sig.offset + sig.bytes.length) {
      return { valid: false, reason: "File too small to validate" };
    }
    const match = sig.bytes.every((b, i) => buffer[sig.offset + i] === b);
    if (match) return { valid: true };
  }

  return { valid: false, reason: "File content does not match declared type" };
}
