export interface PIIMatch {
  type: string;
  value: string;
  start: number;
  end: number;
}

const PATTERNS: { type: string; regex: RegExp }[] = [
  { type: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { type: "phone", regex: /(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g },
  { type: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "credit_card", regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g },
  { type: "ip_address", regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { type: "date_of_birth", regex: /\b(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b/g },
];

export function detectPII(text: string): PIIMatch[] {
  const matches: PIIMatch[] = [];

  for (const pattern of PATTERNS) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

    while ((match = regex.exec(text)) !== null) {
      matches.push({
        type: pattern.type,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  return matches;
}

export function redactPII(text: string, matches: PIIMatch[]): string {
  let redacted = text;
  const sorted = [...matches].sort((a, b) => b.start - a.start);

  for (const match of sorted) {
    const replacement = `[${match.type.toUpperCase()}]`;
    redacted =
      redacted.slice(0, match.start) + replacement + redacted.slice(match.end);
  }

  return redacted;
}
