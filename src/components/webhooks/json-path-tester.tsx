"use client";

/**
 * JSONPath Tester component for the webhook Configuration tab.
 *
 * Allows developers to paste (or load from a preset sample) a JSON payload and
 * instantly preview how each configured body mapping resolves against it, without
 * needing to send a real webhook request.
 *
 * Runs entirely client-side — uses `resolveJsonPath` from `@/lib/webhooks/json-path`.
 */

import { useState, useMemo } from "react";
import { AlertTriangle, ChevronDown, FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolveJsonPath } from "@/lib/webhooks/json-path";
import { WEBHOOK_PRESETS, type BodyMapping } from "@/lib/webhooks/presets";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MappingResult {
  jsonPath: string;
  variableName: string;
  /** undefined → path not found; null → explicit null in payload */
  value: unknown;
  found: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function valueBadgeClass(found: boolean, value: unknown): string {
  if (!found) return "bg-muted/20 border-border text-muted-foreground";
  if (value === null) return "bg-muted/20 border-border text-muted-foreground";
  return "bg-muted/10 border-border text-foreground/60";
}

function parsePayload(raw: string): { parsed: unknown; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { parsed: null, error: null };
  try {
    return { parsed: JSON.parse(trimmed), error: null };
  } catch (e) {
    return {
      parsed: null,
      error: e instanceof SyntaxError ? e.message : "Invalid JSON",
    };
  }
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface JsonPathTesterProps {
  /** The body mappings currently configured for this webhook. */
  bodyMappings: BodyMapping[];
}

export function JsonPathTester({ bodyMappings }: JsonPathTesterProps) {
  const [open, setOpen] = useState(false);
  const [payloadRaw, setPayloadRaw] = useState("");
  const [formatting, setFormatting] = useState(false);

  // Parse JSON and derive mapping results whenever payload or mappings change
  const { parsed, parseError } = useMemo(() => {
    const result = parsePayload(payloadRaw);
    return { parsed: result.parsed, parseError: result.error };
  }, [payloadRaw]);

  const results: MappingResult[] = useMemo(() => {
    if (!parsed || typeof parsed !== "object") return [];
    return bodyMappings
      .filter((m) => m.jsonPath.trim() && m.variableName.trim())
      .map((m) => {
        const value = resolveJsonPath(parsed, m.jsonPath);
        return {
          jsonPath: m.jsonPath,
          variableName: m.variableName,
          value,
          found: value !== undefined,
        };
      });
  }, [parsed, bodyMappings]);

  const validMappings = bodyMappings.filter(
    (m) => m.jsonPath.trim() && m.variableName.trim()
  );

  function loadPreset(presetId: string) {
    const preset = WEBHOOK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setPayloadRaw(JSON.stringify(preset.samplePayload, null, 2));
  }

  function formatJson() {
    if (!payloadRaw.trim()) return;
    setFormatting(true);
    setTimeout(() => {
      try {
        const obj = JSON.parse(payloadRaw);
        setPayloadRaw(JSON.stringify(obj, null, 2));
      } catch {
        // Leave as-is if not valid JSON
      } finally {
        setFormatting(false);
      }
    }, 0);
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header — collapsible */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors rounded-lg"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <FlaskConical className="size-3.5 text-muted-foreground shrink-0" />
          JSONPath Tester
          <span className="text-[11px] font-normal text-muted-foreground">
            — preview body mapping results against a sample payload
          </span>
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-border">
          {/* Empty state when no mappings */}
          {validMappings.length === 0 ? (
            <p className="pt-3 text-xs text-muted-foreground italic">
              Configure at least one body mapping above to use the tester.
            </p>
          ) : (
            <div className="pt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Left: Payload input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Sample Payload</p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={formatJson}
                      disabled={formatting || !payloadRaw.trim()}
                    >
                      {formatting ? (
                        <Loader2 className="size-3 animate-spin mr-1" />
                      ) : null}
                      Format JSON
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px] gap-1"
                        >
                          Load Sample
                          <ChevronDown className="size-2.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {WEBHOOK_PRESETS.filter((p) => p.id !== "generic").map((p) => (
                          <DropdownMenuItem
                            key={p.id}
                            onClick={() => loadPreset(p.id)}
                          >
                            <span className="mr-1.5">{p.icon}</span>
                            {p.name}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem onClick={() => loadPreset("generic")}>
                          <span className="mr-1.5">🔗</span>
                          Generic
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <Textarea
                  value={payloadRaw}
                  onChange={(e) => setPayloadRaw(e.target.value)}
                  placeholder={'{\n  "action": "opened",\n  "ref": "refs/heads/main"\n}'}
                  className="font-mono text-xs resize-y min-h-[160px]"
                  spellCheck={false}
                />
                {parseError && (
                  <p className="text-[11px] text-destructive flex items-center gap-1">
                    <AlertTriangle className="size-3 shrink-0" />
                    {parseError}
                  </p>
                )}
                {!parseError && payloadRaw.trim() && parsed === null && (
                  <p className="text-[11px] text-muted-foreground">
                    Payload is empty — enter JSON to test mappings.
                  </p>
                )}
              </div>

              {/* Right: Results */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Mapping Results</p>
                {!payloadRaw.trim() || parseError ? (
                  <div className="rounded-md border border-dashed border-border flex items-center justify-center min-h-[160px]">
                    <p className="text-xs text-muted-foreground text-center px-4">
                      {parseError
                        ? "Fix the JSON error to see results"
                        : "Enter a JSON payload to preview how your body mappings resolve"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {results.map((r, i) => (
                      <div
                        key={i}
                        className="rounded-md border border-border bg-card px-3 py-2 space-y-0.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <code className="text-[11px] text-muted-foreground font-mono">
                            {r.jsonPath}
                          </code>
                          <code className="text-[11px] text-foreground/70 font-mono shrink-0">
                            → {r.variableName}
                          </code>
                        </div>
                        <div
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium border ${valueBadgeClass(r.found, r.value)}`}
                        >
                          {r.found ? (
                            <span className="max-w-[240px] truncate">
                              {formatValue(r.value)}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1"><AlertTriangle className="size-3 shrink-0" /> not found</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
