import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseSource } from "@/lib/knowledge/parsers";
import { ingestSource } from "@/lib/knowledge/ingest";
import { addKBIngestJob } from "@/lib/queue";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateMagicBytes } from "@/lib/security/magic-numbers";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".xls", ".csv", ".pptx"];
const EXTENSION_MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  const rateResult = checkRateLimit(`kb-upload:${authResult.userId}`, 10);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429 }
    );
  }

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { knowledgeBase: { select: { id: true } } },
  });

  if (!agent?.knowledgeBase) {
    return NextResponse.json(
      { success: false, error: "Knowledge base not found" },
      { status: 404 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const nameField = formData.get("name");

  // Use typeof checks instead of instanceof File to avoid
  // ReferenceError during Next.js build (File may not be defined in build context)
  if (!file || typeof file === "string") {
    return NextResponse.json(
      { success: false, error: "File is required" },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { success: false, error: "Empty file" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        success: false,
        error: `File size (${(file.size / 1024 / 1024).toFixed(1)} MB) exceeds 10 MB limit`,
      },
      { status: 400 }
    );
  }

  const fileName = file.name;
  const ext = fileName.lastIndexOf(".") >= 0
    ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase()
    : "";

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { success: false, error: `Unsupported file type: ${ext || "unknown"}. Allowed: PDF, DOCX, XLSX, CSV, PPTX` },
      { status: 400 }
    );
  }

  const expectedMime = EXTENSION_MIME_MAP[ext];
  if (file.type && file.type !== expectedMime) {
    return NextResponse.json(
      {
        success: false,
        error: `MIME type mismatch: expected ${expectedMime} for ${ext} file, got ${file.type}`,
      },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    const magicCheck = validateMagicBytes(buffer, ext);
    if (!magicCheck.valid) {
      return NextResponse.json(
        { success: false, error: "File content does not match the declared file type" },
        { status: 400 }
      );
    }

    const extractedText = await parseSource({
      type: "FILE",
      fileBuffer: buffer,
      fileName,
    });

    const name = typeof nameField === "string" && nameField.trim()
      ? nameField.trim()
      : fileName;

    const source = await prisma.kBSource.create({
      data: {
        name,
        type: "FILE",
        rawContent: extractedText.length < 1_000_000 ? extractedText : null,
        knowledgeBaseId: agent.knowledgeBase.id,
        status: "PENDING",
      },
    });

    // Enqueue KB ingest — falls back to in-process if Redis unavailable
    addKBIngestJob({ sourceId: source.id, content: extractedText }).catch(() => {
      ingestSource(source.id, extractedText).catch(
        (err) => logger.error("Background ingest failed", err),
      );
    });

    return NextResponse.json(
      { success: true, data: source },
      { status: 201 }
    );
  } catch (error) {
    const message = sanitizeErrorMessage(error, "File upload processing failed");
    return NextResponse.json(
      { success: false, error: message },
      { status: 422 }
    );
  }
}
