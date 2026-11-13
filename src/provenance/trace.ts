import type { Citation, Segment } from "./segment.ts";

function squash(text: string): string {
  return text.replace(/\s+/g, "").toUpperCase();
}

function numbersIn(text: string): number[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", ".")));
}

// threat: the payee is the value an injection wants to swap, so its origin is decided by where the
// exact string was first seen, with the owner's own words ranked above anything the agent read
export function tracePayee(payee: string, prompt: string, segments: Segment[]): Citation {
  const needle = squash(payee);
  if (needle.length === 0) return { kind: "uncited" };
  if (squash(prompt).includes(needle)) return { kind: "owner-prompt" };
  if (segments.some((s) => s.origin === "owner-record" && squash(s.text).includes(needle))) {
    return { kind: "owner-record" };
  }
  const untrusted = segments.find((s) => s.origin === "untrusted" && squash(s.text).includes(needle));
  if (untrusted) return { kind: "untrusted", segment: untrusted.id, source: untrusted.source };
  return { kind: "uncited" };
}

export function traceAmount(amount: number, prompt: string, segments: Segment[]): Citation {
  const matches = (text: string) => numbersIn(text).some((n) => Math.abs(n - amount) < 0.005);
  if (matches(prompt)) return { kind: "owner-prompt" };
  if (segments.some((s) => s.origin === "owner-record" && matches(s.text))) return { kind: "owner-record" };
  const untrusted = segments.find((s) => s.origin === "untrusted" && matches(s.text));
  if (untrusted) return { kind: "untrusted", segment: untrusted.id, source: untrusted.source };
  return { kind: "derived" };
}

export function citationLabel(citation: Citation, intentId?: string): string {
  switch (citation.kind) {
    case "owner-prompt":
      return intentId === undefined ? "owner:prompt" : `owner:${intentId}`;
    case "owner-record":
      return "owner:allowlist";
    case "untrusted":
      return `seg-${citation.segment}`;
    case "derived":
      return "derived";
    case "uncited":
      return "uncited";
  }
}
