export type Origin = "owner-record" | "untrusted";

export type Segment = { id: number; origin: Origin; source: string; text: string };

export type Citation =
  | { kind: "owner-prompt" }
  | { kind: "owner-record" }
  | { kind: "untrusted"; segment: number; source: string }
  | { kind: "derived" }
  | { kind: "uncited" };

// note: a class because the log is the one piece of mutable state a run owns
export class SegmentLog {
  readonly segments: Segment[] = [];

  add(origin: Origin, source: string, text: string): Segment {
    const segment = { id: this.segments.length, origin, source, text };
    this.segments.push(segment);
    return segment;
  }
}
