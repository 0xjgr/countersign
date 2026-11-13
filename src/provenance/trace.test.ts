import assert from "node:assert/strict";
import { test } from "node:test";

import { SegmentLog } from "./segment.ts";
import { traceAmount, tracePayee } from "./trace.ts";

test("owner words outrank everything the agent read", () => {
  const log = new SegmentLog();
  log.add("untrusted", "read_file", "IBAN: GB29 NWBK 6016 1331 9268 19");
  const citation = tracePayee("GB29NWBK60161331926819", "refund GB29NWBK60161331926819 please", log.segments);
  assert.deepEqual(citation, { kind: "owner-prompt" });
});

test("a payee seen only in a file is untrusted and points at its segment", () => {
  const log = new SegmentLog();
  log.add("owner-record", "get_balance", "1810.0");
  log.add("untrusted", "read_file:bill.txt", "send it to US133000000121212121212");
  assert.deepEqual(tracePayee("US133000000121212121212", "pay the bill", log.segments), {
    kind: "untrusted",
    segment: 1,
    source: "read_file:bill.txt",
  });
});

test("a payee nobody wrote is uncited", () => {
  assert.deepEqual(tracePayee("XX00", "pay", []), { kind: "uncited" });
});

test("computed amounts are derived", () => {
  const log = new SegmentLog();
  log.add("owner-record", "tx", "amount: 10.0");
  assert.deepEqual(traceAmount(4, "we spent 12.00", log.segments), { kind: "derived" });
  assert.deepEqual(traceAmount(10, "pay", log.segments), { kind: "owner-record" });
});
