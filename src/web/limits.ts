const WINDOW_MS = 10 * 60_000;
const PER_CLIENT = 4;
const PER_DAY = Number(process.env.DAILY_ATTEMPTS ?? 300);

const recent = new Map<string, number[]>();
let day = new Date().toISOString().slice(0, 10);
let today = 0;

// threat: one visitor draining the model credit or the guard's testnet balance
export function admitAttempt(client: string): { ok: true } | { ok: false; error: string } {
  const now = Date.now();
  const stamp = new Date(now).toISOString().slice(0, 10);
  if (stamp !== day) {
    day = stamp;
    today = 0;
  }
  if (today >= PER_DAY) return { ok: false, error: `The daily limit of ${PER_DAY} attempts is used up. It resets at 00:00 UTC.` };
  const times = (recent.get(client) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= PER_CLIENT) return { ok: false, error: `You can run ${PER_CLIENT} attempts every 10 minutes. Try again shortly.` };
  times.push(now);
  recent.set(client, times);
  today++;
  return { ok: true };
}
