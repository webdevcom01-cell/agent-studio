"use client";

/**
 * VariableInput / VariableTextarea
 *
 * Inputs that show a {{variable}} autocomplete dropdown when the user types "{{".
 *
 * Usage:
 *   <VariableInput value={val} onChange={setVal} variables={flowVars} placeholder="..." />
 *   <VariableTextarea value={val} onChange={setVal} variables={flowVars} rows={4} />
 *
 * Both components share the same dropdown hook.
 */

import { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ─── Shared types ──────────────────────────────────────────────────────────────

interface DropdownState {
  open: boolean;
  /** Text typed after {{ (used to filter variables) */
  filter: string;
  /** Keyboard-highlighted index */
  selectedIdx: number;
}

// ─── Shared logic ──────────────────────────────────────────────────────────────

/**
 * Given the full text and the cursor position, find if there is an open {{
 * before the cursor (i.e. {{ with no matching }} yet).
 * Returns null when not inside a template expression.
 */
function getOpenTemplate(text: string, cursor: number) {
  const before = text.slice(0, cursor);
  const lastOpen = before.lastIndexOf("{{");
  if (lastOpen === -1) return null;
  const afterOpen = before.slice(lastOpen + 2);
  // If there's already a closing }} between the {{ and the cursor, we're done
  if (afterOpen.includes("}}")) return null;
  return { start: lastOpen, filter: afterOpen };
}

/**
 * Replace the partial {{filter at `start` up to `cursor` with {{varName}}.
 */
function buildNewValue(
  value: string,
  start: number,
  cursor: number,
  varName: string,
): { newValue: string; newCursor: number } {
  const newValue =
    value.slice(0, start) + `{{${varName}}}` + value.slice(cursor);
  const newCursor = start + varName.length + 4; // {{ + name + }}
  return { newValue, newCursor };
}

// ─── Shared hook ───────────────────────────────────────────────────────────────

function useVariableDropdown<T extends HTMLInputElement | HTMLTextAreaElement>(
  variables: string[],
  value: string,
  onChange: (val: string) => void,
  ref: React.RefObject<T | null>,
) {
  const [dropdown, setDropdown] = useState<DropdownState>({
    open: false,
    filter: "",
    selectedIdx: 0,
  });

  const matches = dropdown.open
    ? variables.filter((v) =>
        v.toLowerCase().startsWith(dropdown.filter.toLowerCase()),
      )
    : [];

  const handleChange = useCallback(
    (e: React.ChangeEvent<T>) => {
      const newVal = e.target.value;
      const cursor = e.target.selectionStart ?? newVal.length;
      onChange(newVal);

      const ctx = getOpenTemplate(newVal, cursor);
      if (ctx && variables.length > 0) {
        setDropdown({ open: true, filter: ctx.filter, selectedIdx: 0 });
      } else {
        setDropdown((d) => ({ ...d, open: false }));
      }
    },
    [onChange, variables],
  );

  const insertVariable = useCallback(
    (varName: string) => {
      const el = ref.current;
      if (!el) return;
      const cursor = el.selectionStart ?? value.length;
      const ctx = getOpenTemplate(value, cursor);
      if (!ctx) return;

      const { newValue, newCursor } = buildNewValue(
        value,
        ctx.start,
        cursor,
        varName,
      );
      onChange(newValue);
      setDropdown({ open: false, filter: "", selectedIdx: 0 });

      // Restore focus and cursor after React re-render
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(newCursor, newCursor);
      });
    },
    [ref, value, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<T>) => {
      if (!dropdown.open || matches.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setDropdown((d) => ({
          ...d,
          selectedIdx: Math.min(d.selectedIdx + 1, matches.length - 1),
        }));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setDropdown((d) => ({
          ...d,
          selectedIdx: Math.max(d.selectedIdx - 1, 0),
        }));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (matches[dropdown.selectedIdx]) {
          e.preventDefault();
          insertVariable(matches[dropdown.selectedIdx]);
        }
      } else if (e.key === "Escape") {
        setDropdown((d) => ({ ...d, open: false }));
      }
    },
    [dropdown, matches, insertVariable],
  );

  const handleBlur = useCallback(() => {
    // Delay so onMouseDown on a dropdown item fires before blur closes it
    setTimeout(
      () => setDropdown((d) => ({ ...d, open: false })),
      150,
    );
  }, []);

  return {
    dropdown,
    matches,
    handleChange,
    handleKeyDown,
    handleBlur,
    insertVariable,
  };
}

// ─── Dropdown UI ───────────────────────────────────────────────────────────────

function VariableDropdown({
  matches,
  selectedIdx,
  onSelect,
}: {
  matches: string[];
  selectedIdx: number;
  onSelect: (v: string) => void;
}) {
  if (matches.length === 0) return null;
  return (
    <div
      role="listbox"
      aria-label="Available variables"
      className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-border bg-popover shadow-lg"
    >
      <ul className="max-h-44 overflow-y-auto py-1">
        {matches.map((v, i) => (
          <li key={v} role="option" aria-selected={i === selectedIdx}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-1.5 px-3 py-1.5 text-left",
                i === selectedIdx
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-accent/50",
              )}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent input blur before click
                onSelect(v);
              }}
            >
              <span className="font-mono text-[11px] text-muted-foreground/60">{"{{"}</span>
              <span className="font-mono text-[11px]">{v}</span>
              <span className="font-mono text-[11px] text-muted-foreground/60">{"}}"}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t px-3 py-1 text-[10px] text-muted-foreground">
        ↑↓ navigate · Enter/Tab insert · Esc dismiss
      </div>
    </div>
  );
}

// ─── Public components ─────────────────────────────────────────────────────────

interface VariableInputBaseProps {
  value: string;
  onChange: (val: string) => void;
  /** List of variable names to suggest (without {{ }}) */
  variables: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Single-line input with {{variable}} autocomplete.
 */
export function VariableInput({
  value,
  onChange,
  variables,
  placeholder,
  className,
  disabled,
}: VariableInputBaseProps) {
  const ref = useRef<HTMLInputElement>(null);
  const { matches, dropdown, handleChange, handleKeyDown, handleBlur, insertVariable } =
    useVariableDropdown(variables, value, onChange, ref);

  const isOpen = dropdown.open && matches.length > 0;

  return (
    <div className="relative">
      <Input
        ref={ref}
        value={value}
        onChange={handleChange as React.ChangeEventHandler<HTMLInputElement>}
        onKeyDown={handleKeyDown as React.KeyboardEventHandler<HTMLInputElement>}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
      />
      {isOpen && (
        <VariableDropdown
          matches={matches}
          selectedIdx={dropdown.selectedIdx}
          onSelect={insertVariable}
        />
      )}
    </div>
  );
}

/**
 * Multi-line textarea with {{variable}} autocomplete.
 */
export function VariableTextarea({
  value,
  onChange,
  variables,
  placeholder,
  className,
  disabled,
  rows,
}: VariableInputBaseProps & { rows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { matches, dropdown, handleChange, handleKeyDown, handleBlur, insertVariable } =
    useVariableDropdown(variables, value, onChange, ref);

  const isOpen = dropdown.open && matches.length > 0;

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange as React.ChangeEventHandler<HTMLTextAreaElement>}
        onKeyDown={handleKeyDown as React.KeyboardEventHandler<HTMLTextAreaElement>}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        rows={rows}
      />
      {isOpen && (
        <VariableDropdown
          matches={matches}
          selectedIdx={dropdown.selectedIdx}
          onSelect={insertVariable}
        />
      )}
    </div>
  );
}
