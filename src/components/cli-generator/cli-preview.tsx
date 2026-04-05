"use client";

import { Terminal, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface CLICommand {
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
}

interface CLIConfig {
  appId: string;
  toolPrefix: string;
  commands: CLICommand[];
  version: string;
  applicationName: string;
}

interface CLIPreviewProps {
  cliConfig: CLIConfig | null;
}

export function CLIPreview({
  cliConfig,
}: CLIPreviewProps): React.JSX.Element {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  if (!cliConfig) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Terminal className="size-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          CLI preview will appear here once generation completes
        </p>
      </div>
    );
  }

  function handleCopy(text: string, commandName: string): void {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCommand(commandName);
      setTimeout(() => setCopiedCommand(null), 2000);
    }).catch(() => {
      // clipboard not available
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{cliConfig.applicationName}</h3>
          <p className="text-xs text-muted-foreground">
            v{cliConfig.version} &middot; {(cliConfig.commands ?? []).length} command
            {(cliConfig.commands ?? []).length !== 1 ? "s" : ""}
          </p>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
          {cliConfig.toolPrefix}_*
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {(cliConfig.commands ?? []).map((cmd) => {
          const usage = buildUsageString(cmd);
          return (
            <div
              key={cmd.name}
              className="rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-center justify-between mb-1.5">
                <code className="text-xs font-mono font-medium text-foreground">
                  {cmd.name}
                </code>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleCopy(usage, cmd.name)}
                  title="Copy usage"
                >
                  {copiedCommand === cmd.name ? (
                    <Check className="size-3 text-foreground/60" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                {cmd.description}
              </p>
              {(cmd.parameters ?? []).length > 0 && (
                <div className="flex flex-col gap-1">
                  {(cmd.parameters ?? []).map((param) => (
                    <div
                      key={param.name}
                      className="flex items-center gap-2 text-[11px]"
                    >
                      <code className="font-mono text-muted-foreground">
                        {param.name}
                      </code>
                      <span className="text-[10px] text-muted-foreground/60">
                        {param.type}
                      </span>
                      {param.required && (
                        <span className="text-[10px] text-muted-foreground">
                          required
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildUsageString(cmd: CLICommand): string {
  const params = cmd.parameters
    .map((p) => (p.required ? `--${p.name} <${p.type}>` : `[--${p.name} <${p.type}>]`))
    .join(" ");
  return `${cmd.name} ${params}`.trim();
}
