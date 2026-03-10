import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseSource } from "@/lib/knowledge/parsers";
import { ingestSource } from "@/lib/knowledge/ingest";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".docx"];
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

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

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "File is required" },
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
      { success: false, error: `Unsupported file type: ${ext || "unknown"}. Allowed: PDF, DOCX` },
      { status: 400 }
    );
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { success: false, error: `Unsupported MIME type: ${file.type}. Allowed: PDF, DOCX` },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
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

    ingestSource(source.id, extractedText).catch(
      (err) => logger.error("Background ingest failed", err)
    );

    return NextResponse.json(
      { success: true, data: source },
      { status: 201 }
    );
  } catch (error) {
    logger.error("File upload processing failed", error instanceof Error ? error : new Error(String(error)), { agentId });
    return NextResponse.json(
      { success: false, error: "Failed to process file" },
      { status: 422 }
    );
  }
}
