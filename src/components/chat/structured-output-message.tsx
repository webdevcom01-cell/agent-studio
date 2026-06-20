"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  FileCode2,
  Package,
  KeyRound,
  Database,
  Shield,
  Server,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Safe accessor helpers ────────────────────────────────────────────────────

function asString(val: unknown, fallback = ""): string {
  return typeof val === "string" ? val : fallback;
}

function asNumber(val: unknown, fallback = 0): number {
  return typeof val === "number" ? val : fallback;
}

function asArray(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [];
}

function asRecord(val: unknown): Record<string, unknown> {
  if (val !== null && typeof val === "object" && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return {};
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-foreground/10 transition-colors text-muted-foreground hover:text-foreground"
      title="Copy to clipboard"
    >
      {copied
        ? <Check className="size-3.5 text-success" />
        : <Copy className="size-3.5" />
      }
    </button>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({
  icon,
  label,
  count,
  children,
  defaultOpen = true,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 bg-card/60 hover:bg-card/80 transition-colors text-left"
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1 text-xs font-medium text-foreground/80">{label}</span>
        {count !== undefined && (
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">{count}</span>
        )}
        {open
          ? <ChevronDown className="size-3.5 text-muted-foreground/40 shrink-0" />
          : <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
        }
      </button>
      {open && <div className="bg-background/40">{children}</div>}
    </div>
  );
}

// ─── CodeGen renderer ─────────────────────────────────────────────────────────

function CodeGenRenderer({ data }: { data: Record<string, unknown> }) {
  const files = asArray(data.files);
  const deps = asArray(data.dependencies);
  const envVars = asArray(data.envVariables);
  const prismaChanges = asString(data.prismaSchemaChanges);

  return (
    <div className="flex flex-col gap-2">

      {/* Files */}
      {files.length > 0 && (
        <Section
          icon={<FileCode2 className="size-3.5" />}
          label="Generated Files"
          count={files.length}
        >
          <div className="divide-y divide-border/30">
            {files.map((f, i) => {
              const file = asRecord(f);
              const path = asString(file.path, `file-${i}`);
              const content = asString(file.content);
              const language = asString(file.language, "typescript");
              const isNew = file.isNew === true;

              return (
                <div key={i} className="px-3 py-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-mono text-muted-foreground/70 flex-1 truncate">
                      {path}
                    </span>
                    {isNew && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-success/15 text-success font-medium">
                        NEW
                      </span>
                    )}
                    <CopyButton text={content} />
                  </div>
                  <pre className="text-[11px] font-mono text-foreground/70 bg-muted rounded p-2 overflow-x-auto max-h-48 leading-relaxed">
                    <code data-language={language}>{content}</code>
                  </pre>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Dependencies */}
      {deps.length > 0 && (
        <Section
          icon={<Package className="size-3.5" />}
          label="npm Dependencies"
          count={deps.length}
          defaultOpen={false}
        >
          <div className="px-3 py-2 flex flex-col gap-1">
            {deps.map((d, i) => {
              const dep = asRecord(d);
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-foreground/80 flex-1">
                    {asString(dep.name)}
                  </span>
                  <span className="text-muted-foreground/60 font-mono">
                    {asString(dep.version)}
                  </span>
                  {dep.isDev === true && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      dev
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Env Variables */}
      {envVars.length > 0 && (
        <Section
          icon={<KeyRound className="size-3.5" />}
          label="Environment Variables"
          count={envVars.length}
          defaultOpen={false}
        >
          <div className="px-3 py-2 flex flex-col gap-1.5">
            {envVars.map((e, i) => {
              const env = asRecord(e);
              return (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="font-mono text-warning/80 shrink-0">
                    {asString(env.key)}
                  </span>
                  {env.required === true && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-destructive/15 text-destructive shrink-0">
                      required
                    </span>
                  )}
                  <span className="text-muted-foreground/60 leading-tight">
                    {asString(env.description)}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Prisma schema changes */}
      {prismaChanges && (
        <Section
          icon={<Database className="size-3.5" />}
          label="Prisma Schema Changes"
          defaultOpen={false}
        >
          <div className="px-3 py-2">
            <div className="flex justify-end mb-1">
              <CopyButton text={prismaChanges} />
            </div>
            <pre className="text-[11px] font-mono text-foreground/70 bg-muted rounded p-2 overflow-x-auto max-h-48 leading-relaxed">
              <code>{prismaChanges}</code>
            </pre>
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── PRGate renderer ──────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<string, { color: string; label: string }> = {
  CRITICAL: { color: "text-destructive bg-destructive/15 border-destructive/30", label: "CRITICAL" },
  HIGH:     { color: "text-severity-high bg-severity-high/15 border-severity-high/30", label: "HIGH" },
  MEDIUM:   { color: "text-warning bg-warning/15 border-warning/30", label: "MEDIUM" },
  LOW:      { color: "text-info bg-info/15 border-info/30", label: "LOW" },
};

function ScoreBadge({ label, score }: { label: string; score: number }) {
  const color =
    score >= 80 ? "text-success" :
    score >= 60 ? "text-warning" :
    "text-destructive";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn("text-lg font-bold tabular-nums", color)}>{score}</span>
      <span className="text-[10px] text-muted-foreground/60">{label}</span>
    </div>
  );
}

function PRGateRenderer({ data }: { data: Record<string, unknown> }) {
  const decision = asString(data.decision, "APPROVE");
  const compositeScore = asNumber(data.compositeScore);
  const securityScore = asNumber(data.securityScore);
  const qualityScore = asNumber(data.qualityScore);
  const issues = asArray(data.issues);

  const critical = issues.filter((i) => asRecord(i).severity === "CRITICAL").length;
  const high = issues.filter((i) => asRecord(i).severity === "HIGH").length;

  const decisionConfig = {
    APPROVE: {
      icon: <CheckCircle2 className="size-4" />,
      bg: "bg-success/15 border-success/30",
      text: "text-success",
      label: "APPROVED",
    },
    APPROVE_WITH_NOTES: {
      icon: <AlertTriangle className="size-4" />,
      bg: "bg-warning/15 border-warning/30",
      text: "text-warning",
      label: "APPROVED WITH NOTES",
    },
    BLOCK: {
      icon: <XCircle className="size-4" />,
      bg: "bg-destructive/15 border-destructive/30",
      text: "text-destructive",
      label: "BLOCKED",
    },
  }[decision] ?? {
    icon: <CheckCircle2 className="size-4" />,
    bg: "bg-muted border-border",
    text: "text-muted-foreground",
    label: decision,
  };

  return (
    <div className="flex flex-col gap-2">

      {/* Decision banner */}
      <div className={cn(
        "flex items-center gap-2.5 rounded-lg border px-3 py-2.5",
        decisionConfig.bg
      )}>
        <span className={decisionConfig.text}>{decisionConfig.icon}</span>
        <span className={cn("font-semibold text-sm", decisionConfig.text)}>
          {decisionConfig.label}
        </span>
        {(critical > 0 || high > 0) && (
          <span className="ml-auto text-[11px] text-muted-foreground/70">
            {critical > 0 && <span className="text-destructive">{critical} critical</span>}
            {critical > 0 && high > 0 && " · "}
            {high > 0 && <span className="text-severity-high">{high} high</span>}
          </span>
        )}
      </div>

      {/* Scores */}
      <div className="flex justify-around py-2 rounded-lg border border-border/60 bg-card/40">
        <ScoreBadge label="Composite" score={compositeScore} />
        <div className="w-px bg-border/40" />
        <ScoreBadge label="Security" score={securityScore} />
        <div className="w-px bg-border/40" />
        <ScoreBadge label="Quality" score={qualityScore} />
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <Section
          icon={<AlertTriangle className="size-3.5" />}
          label="Issues"
          count={issues.length}
          defaultOpen={issues.length <= 5}
        >
          <div className="divide-y divide-border/30">
            {issues.map((item, i) => {
              const issue = asRecord(item);
              const severity = asString(issue.severity, "LOW");
              const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.LOW;
              return (
                <div key={i} className="px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded border font-medium",
                      cfg.color
                    )}>
                      {cfg.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 font-mono truncate">
                      {asString(issue.file)}
                      {issue.line !== undefined && `:${asNumber(issue.line)}`}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/80 mb-1">
                    {asString(issue.message)}
                  </p>
                  {asString(issue.fix) && (
                    <p className="text-xs text-muted-foreground/60 italic">
                      Fix: {asString(issue.fix)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Architecture renderer ────────────────────────────────────────────────────

function ArchitectureRenderer({ data }: { data: Record<string, unknown> }) {
  const techStack = asArray(data.techStack);
  const systemDesign = asString(data.systemDesign);
  const databaseSchema = asString(data.databaseSchema);
  const apiDesign = asString(data.apiDesign);
  const securityConsiderations = asArray(data.securityConsiderations);
  const deploymentStrategy = asString(data.deploymentStrategy);

  return (
    <div className="flex flex-col gap-2">

      {/* Tech stack table */}
      {techStack.length > 0 && (
        <Section
          icon={<Layers className="size-3.5" />}
          label="Tech Stack"
          count={techStack.length}
        >
          <div className="divide-y divide-border/30">
            {techStack.map((item, i) => {
              const t = asRecord(item);
              return (
                <div key={i} className="px-3 py-2 flex gap-3">
                  <div className="w-24 shrink-0">
                    <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">
                      {asString(t.category)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <span className="text-xs font-medium text-foreground/90">
                      {asString(t.choice)}
                    </span>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">
                      {asString(t.justification)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* System design */}
      {systemDesign && (
        <Section
          icon={<Server className="size-3.5" />}
          label="System Design"
          defaultOpen={false}
        >
          <div className="px-3 py-2">
            <p className="text-xs text-foreground/75 leading-relaxed whitespace-pre-wrap">
              {systemDesign}
            </p>
          </div>
        </Section>
      )}

      {/* Database schema */}
      {databaseSchema && (
        <Section
          icon={<Database className="size-3.5" />}
          label="Database Schema"
          defaultOpen={false}
        >
          <div className="px-3 py-2">
            <div className="flex justify-end mb-1">
              <CopyButton text={databaseSchema} />
            </div>
            <pre className="text-[11px] font-mono text-foreground/70 bg-muted rounded p-2 overflow-x-auto max-h-48 leading-relaxed">
              <code>{databaseSchema}</code>
            </pre>
          </div>
        </Section>
      )}

      {/* API design */}
      {apiDesign && (
        <Section
          icon={<FileCode2 className="size-3.5" />}
          label="API Design"
          defaultOpen={false}
        >
          <div className="px-3 py-2">
            <pre className="text-[11px] font-mono text-foreground/70 bg-muted rounded p-2 overflow-x-auto max-h-48 leading-relaxed whitespace-pre-wrap">
              <code>{apiDesign}</code>
            </pre>
          </div>
        </Section>
      )}

      {/* Security considerations */}
      {securityConsiderations.length > 0 && (
        <Section
          icon={<Shield className="size-3.5" />}
          label="Security Considerations"
          count={securityConsiderations.length}
          defaultOpen={false}
        >
          <div className="px-3 py-2 flex flex-col gap-1.5">
            {securityConsiderations.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground/40 mt-0.5 shrink-0">•</span>
                <span className="text-foreground/75">{asString(item)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Deployment strategy */}
      {deploymentStrategy && (
        <Section
          icon={<Server className="size-3.5" />}
          label="Deployment Strategy"
          defaultOpen={false}
        >
          <div className="px-3 py-2">
            <p className="text-xs text-foreground/75 leading-relaxed">
              {deploymentStrategy}
            </p>
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// ─── Generic human-readable renderer (fallback for any schema) ───────────────

/** camelCase / snake_case / SCREAMING_CASE → "Title Case" */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isUrl(s: string): boolean {
  return /^https?:\/\/\S+$/i.test(s.trim());
}

function GenericValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground/50 italic">—</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-foreground">{value ? "Yes" : "No"}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-foreground tabular-nums">{value}</span>;
  }
  if (typeof value === "string") {
    if (isUrl(value)) {
      return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 break-all">
          {value}
        </a>
      );
    }
    return <span className="text-foreground whitespace-pre-wrap break-words">{value}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground/50 italic">—</span>;
    const allPrimitive = value.every((v) => v === null || ["string", "number", "boolean"].includes(typeof v));
    if (allPrimitive) {
      return (
        <ul className="list-disc pl-4 space-y-0.5">
          {value.map((v, i) => (
            <li key={i} className="text-foreground"><GenericValue value={v} /></li>
          ))}
        </ul>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {value.map((v, i) => (
          <div key={i} className="rounded-md border border-border/60 bg-background/40 p-2">
            <GenericValue value={v} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    return <GenericObject data={value as Record<string, unknown>} />;
  }
  return <span className="text-foreground">{String(value)}</span>;
}

function GenericObject({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return <span className="text-muted-foreground/50 italic">—</span>;
  return (
    <dl className="flex flex-col gap-2">
      {entries.map(([k, v]) => {
        const nested = typeof v === "object" && v !== null;
        return (
          <div key={k} className={nested ? "flex flex-col gap-1" : "flex gap-2 items-baseline"}>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground shrink-0 min-w-[88px]">
              {humanizeKey(k)}
            </dt>
            <dd className="text-sm flex-1 min-w-0 leading-relaxed"><GenericValue value={v} /></dd>
          </div>
        );
      })}
    </dl>
  );
}

function GenericRenderer({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1"><GenericObject data={data} /></div>
        <CopyButton text={JSON.stringify(data, null, 2)} />
      </div>
    </div>
  );
}

const SCHEMA_LABELS: Record<string, string> = {
  CodeGenOutput: "Code Generation",
  PRGateOutput: "PR Review Gate",
  ArchitectureOutput: "Architecture Plan",
};

interface StructuredOutputMessageProps {
  schemaName: string;
  data: Record<string, unknown>;
}

export function StructuredOutputMessage({ schemaName, data }: StructuredOutputMessageProps) {
  const label = SCHEMA_LABELS[schemaName] ?? schemaName;

  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {/* Schema type label */}
      <div className="flex items-center gap-1.5">
        <div className="h-px flex-1 bg-border/40" />
        <span className="text-[10px] text-muted-foreground/40 uppercase tracking-widest px-1">
          {label}
        </span>
        <div className="h-px flex-1 bg-border/40" />
      </div>

      {/* Renderer */}
      {schemaName === "CodeGenOutput" && <CodeGenRenderer data={data} />}
      {schemaName === "PRGateOutput" && <PRGateRenderer data={data} />}
      {schemaName === "ArchitectureOutput" && <ArchitectureRenderer data={data} />}
      {!["CodeGenOutput", "PRGateOutput", "ArchitectureOutput"].includes(schemaName) && (
        <GenericRenderer data={data} />
      )}
    </div>
  );
}
