const DEFAULT_MAX_BYTES = 1_048_576;

export class BodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Request body exceeds ${maxBytes} byte limit`);
    this.name = "BodyTooLargeError";
  }
}

export class InvalidJsonError extends Error {
  constructor() {
    super("Invalid JSON in request body");
    this.name = "InvalidJsonError";
  }
}

export async function parseBodyWithLimit(
  request: Request,
  maxBytes: number = DEFAULT_MAX_BYTES
): Promise<unknown> {
  const text = await request.text();

  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new BodyTooLargeError(maxBytes);
  }

  if (text.length === 0) {
    throw new InvalidJsonError();
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new InvalidJsonError();
  }
}
