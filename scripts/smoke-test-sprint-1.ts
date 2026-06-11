/**
 * Sprint 1 — Smoke test runner.
 *
 * Verifies SC-1, SC-2, SC-3 from sprint-contract.md and prints
 *   SC-1: PASS
 *   SC-2: PASS
 *   SC-3: PASS
 * on success. Exits 0 on success, 1 on any failure.
 *
 * Run with:
 *   node --import tsx scripts/smoke-test-sprint-1.ts
 */

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  EventEmitterMessageBus,
  countLogLines,
  emitAgentAuditLog,
  getMessageBus,
  resolveLogFile,
  setMessageBus,
  type Agent,
  type AgentContext,
  type AgentInput,
  type AgentOutput,
  type AuditLogEntry,
  type HealthStatus,
} from "../src/agents/index.js";

const LOG_DIR = path.resolve(process.cwd(), "./logs");

interface ScResult {
  id: "SC-1" | "SC-2" | "SC-3";
  pass: boolean;
  detail: string;
}

const results: ScResult[] = [];

// ----------------------------------------------------------------------------
// SC-1 — Agent base interface is defined and a stub agent can implement it
// ----------------------------------------------------------------------------

class StubAgent implements Agent {
  readonly id: string = "stub-preprocess-001";
  readonly version: string = "0.1.0";
  private initialized = false;

  async init(_ctx: AgentContext): Promise<void> {
    void _ctx;
    this.initialized = true;
  }

  async run(input: AgentInput): Promise<AgentOutput> {
    if (!this.initialized) {
      throw new Error(`StubAgent ${this.id} not initialized`);
    }
    return {
      image_id: input.image_id,
      score: 0.87,
      reason: "violation",
    };
  }

  async healthcheck(): Promise<HealthStatus> {
    return { ok: true, latencyMs: 1 };
  }
}

async function runSc1(): Promise<ScResult> {
  try {
    const agent = new StubAgent();
    if (agent.id !== "stub-preprocess-001") {
      return { id: "SC-1", pass: false, detail: `unexpected id ${agent.id}` };
    }
    if (agent.version !== "0.1.0") {
      return { id: "SC-1", pass: false, detail: `unexpected version ${agent.version}` };
    }
    await agent.init({});
    const output = await agent.run({ image_id: "img-1" });
    if (output.image_id !== "img-1" || output.score !== 0.87 || output.reason !== "violation") {
      return { id: "SC-1", pass: false, detail: `unexpected output ${JSON.stringify(output)}` };
    }
    const health = await agent.healthcheck();
    if (health.ok !== true) {
      return { id: "SC-1", pass: false, detail: `unexpected health ${JSON.stringify(health)}` };
    }
    // Print the tokens the evaluator step requires (id, version, output fields).
    console.log(`SC-1: stub-id:${agent.id}:stub-version:${agent.version}:output:${JSON.stringify(output)}`);
    return { id: "SC-1", pass: true, detail: "stub agent round-trip OK" };
  } catch (err) {
    return { id: "SC-1", pass: false, detail: `threw: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------------------------------
// SC-2 — MessageBus delivers published messages to subscribers + request/resp
// ----------------------------------------------------------------------------

async function runSc2(): Promise<ScResult> {
  try {
    // Use a fresh bus so the test is hermetic (no leftover subscribers).
    const bus: EventEmitterMessageBus = new EventEmitterMessageBus();
    setMessageBus(bus);

    // ---- publish/subscribe path ----
    let receivedCount = 0;
    let receivedPayload: { image_id: string; hash: string } | null = null;

    const unsubscribe = bus.subscribe<{ image_id: string; hash: string }>(
      "agent.preprocess.done",
      (msg) => {
        receivedCount++;
        receivedPayload = msg.payload;
      },
    );

    const delivered = bus.publish("agent.preprocess.done", {
      image_id: "img-1",
      hash: "deadbeef",
    });

    if (delivered !== 1) {
      unsubscribe();
      return { id: "SC-2", pass: false, detail: `expected 1 delivery, got ${delivered}` };
    }
    if (receivedCount !== 1) {
      unsubscribe();
      return { id: "SC-2", pass: false, detail: `expected 1 invocation, got ${receivedCount}` };
    }
    if (
      receivedPayload === null ||
      receivedPayload.image_id !== "img-1" ||
      receivedPayload.hash !== "deadbeef"
    ) {
      unsubscribe();
      return { id: "SC-2", pass: false, detail: `payload mismatch: ${JSON.stringify(receivedPayload)}` };
    }

    // Print the token the evaluator step requires.
    console.log(
      `SC-2: subscriber-received:${receivedPayload.image_id}:${receivedPayload.hash}`,
    );

    // ---- second publish must NOT reach the first subscriber (unsubscribe works) ----
    unsubscribe();
    bus.publish("agent.preprocess.done", { image_id: "img-2", hash: "f00d" });
    if (receivedCount !== 1) {
      return { id: "SC-2", pass: false, detail: `unsubscribe failed; got ${receivedCount} calls` };
    }

    // ---- request/response path ----
    const RESPONSE_TYPE = "agent.compute.score";
    bus.subscribe<{ value: number }>(`${RESPONSE_TYPE}.request`, (msg) => {
      // Echo a typed response on the response channel with the same
      // correlationId so request() can resolve.
      bus.publish(RESPONSE_TYPE + ".response", { value: 42 }, msg.correlationId);
    });

    const result = await bus.request<{ image_id: string }, { value: number }>(
      RESPONSE_TYPE,
      { image_id: "img-9" },
      2000,
    );
    if (result.value !== 42) {
      return { id: "SC-2", pass: false, detail: `request returned ${JSON.stringify(result)}` };
    }
    console.log(`SC-2: request-resolved:${result.value}`);

    return { id: "SC-2", pass: true, detail: "publish + request/response OK" };
  } catch (err) {
    return { id: "SC-2", pass: false, detail: `threw: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------------------------------
// SC-3 — Audit-log emission writes one structured line per agent run
// ----------------------------------------------------------------------------

async function runSc3(): Promise<ScResult> {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    const agent = new StubAgent();
    await agent.init({});

    // Use the same file-resolution logic the writer uses, so our
    // before/after counts are on the exact same file.
    const logFile = await resolveLogFile(LOG_DIR);
    const beforeCount = await countLogLines(logFile);

    const t0 = performance.now();
    const output = await agent.run({ image_id: "img-1" });
    const elapsed = performance.now() - t0;

    const entry: AuditLogEntry = {
      image_id: output.image_id,
      agent: agent.id,
      score: output.score,
      reason: output.reason,
      elapsed_ms: Math.round(elapsed * 100) / 100,
    };
    const writtenTo = await emitAgentAuditLog(entry);

    if (writtenTo !== logFile) {
      return {
        id: "SC-3",
        pass: false,
        detail: `writer picked a different file (${writtenTo}) than expected (${logFile})`,
      };
    }

    const afterCount = await countLogLines(logFile);
    const delta = afterCount - beforeCount;
    console.log(`SC-3: audit-line-count:${delta}:written-to:${path.basename(writtenTo)}`);

    if (delta !== 1) {
      return { id: "SC-3", pass: false, detail: `expected 1 new line, got ${delta}` };
    }

    // Verify the last line is valid JSON with the required field set.
    const content = await readFile(writtenTo, "utf8");
    const lines = content.split("\n").filter((l) => l.length > 0);
    const lastLine = lines[lines.length - 1]!;
    let parsed: unknown;
    try {
      parsed = JSON.parse(lastLine);
    } catch (err) {
      return { id: "SC-3", pass: false, detail: `last line not JSON: ${(err as Error).message}` };
    }
    if (typeof parsed !== "object" || parsed === null) {
      return { id: "SC-3", pass: false, detail: "parsed entry is not an object" };
    }
    const obj = parsed as Record<string, unknown>;
    for (const k of ["timestamp", "level", "phase", "message", "context"]) {
      if (!(k in obj)) {
        return { id: "SC-3", pass: false, detail: `missing top-level key: ${k}` };
      }
    }
    const ctx = obj.context as Record<string, unknown>;
    for (const k of ["image_id", "agent", "score", "reason", "elapsed_ms"]) {
      if (!(k in ctx)) {
        return { id: "SC-3", pass: false, detail: `missing context key: ${k}` };
      }
    }
    if (
      ctx.image_id !== "img-1" ||
      ctx.agent !== "stub-preprocess-001" ||
      ctx.score !== 0.87 ||
      ctx.reason !== "violation" ||
      typeof ctx.elapsed_ms !== "number"
    ) {
      return {
        id: "SC-3",
        pass: false,
        detail: `context field mismatch: ${JSON.stringify(ctx)}`,
      };
    }

    return { id: "SC-3", pass: true, detail: "audit line written and validated" };
  } catch (err) {
    return { id: "SC-3", pass: false, detail: `threw: ${(err as Error).message}` };
  }
}

// ----------------------------------------------------------------------------
// Runner
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  // Ensure the bus is the default before any SC runs.
  setMessageBus(new EventEmitterMessageBus());
  // Touch getMessageBus() once so the import is exercised (defensive).
  void getMessageBus();

  // Run SC-1 first (it is type-only and does not touch IO).
  results.push(await runSc1());
  results.push(await runSc2());
  results.push(await runSc3());

  for (const r of results) {
    // The Evaluator greps for the exact token "SC-N: PASS".
    console.log(`${r.id}: ${r.pass ? "PASS" : "FAIL"} ${r.detail}`);
  }

  const allPass = results.every((r) => r.pass);
  process.exit(allPass ? 0 : 1);
}

void main();
