/**
 * Unit tests for src/agents/audit-log.ts
 * Covers: one-line-per-call, JSON shape, every required field present.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { countLogLines, emitAgentAuditLog, resolveLogFile } from "./audit-log.js";

let tmpDir: string;
let originalCwd: string;

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = await mkdtemp(path.join(tmpdir(), "audit-log-test-"));
  process.chdir(tmpDir);
});

afterAll(async () => {
  process.chdir(originalCwd);
  await rm(tmpDir, { recursive: true, force: true });
});

describe("emitAgentAuditLog", () => {
  it("writes one structured line per call", async () => {
    const logFile = await resolveLogFile(path.resolve(process.cwd(), "./logs"));
    const before = await countLogLines(logFile);
    const written = await emitAgentAuditLog({
      image_id: "img-1",
      agent: "stub-preprocess-001",
      score: 0.87,
      reason: "violation",
      elapsed_ms: 12.34,
    });
    expect(written).toBe(logFile);
    const after = await countLogLines(logFile);
    expect(after - before).toBe(1);
    const content = await readFile(logFile, "utf8");
    const lines = content.split("\n").filter((l) => l.length > 0);
    const last = JSON.parse(lines[lines.length - 1]!);
    expect(last.timestamp).toBeTypeOf("string");
    expect(last.level).toBe("INFO");
    expect(last.phase).toBe("AGENT_RUN");
    expect(last.message).toBe("agent.audit");
    expect(last.context.image_id).toBe("img-1");
    expect(last.context.agent).toBe("stub-preprocess-001");
    expect(last.context.score).toBe(0.87);
    expect(last.context.reason).toBe("violation");
    expect(last.context.elapsed_ms).toBeTypeOf("number");
  });

  it("appends to the same file on subsequent calls (no per-call rotation)", async () => {
    const logFile = await resolveLogFile(path.resolve(process.cwd(), "./logs"));
    const before = await countLogLines(logFile);
    await emitAgentAuditLog({
      image_id: "img-2",
      agent: "stub-preprocess-002",
      score: 0.1,
      reason: "ok",
      elapsed_ms: 0.5,
    });
    await emitAgentAuditLog({
      image_id: "img-3",
      agent: "stub-preprocess-003",
      score: 0.2,
      reason: "ok",
      elapsed_ms: 0.6,
    });
    const after = await countLogLines(logFile);
    expect(after - before).toBe(2);
  });
});

describe("resolveLogFile", () => {
  it("creates a fresh file in an empty directory", async () => {
    const dir = path.join(tmpDir, "fresh-" + Date.now());
    const file = await resolveLogFile(dir);
    expect(file.startsWith(dir)).toBe(true);
    expect(path.basename(file)).toMatch(/^audit_\d{8}_\d{6}\.log$/);
  });

  it("picks the most recent existing audit_*.log", async () => {
    const dir = path.join(tmpDir, "pick-" + Date.now());
    await import("node:fs/promises").then((m) => m.mkdir(dir, { recursive: true }));
    const older = "audit_20200101_000000.log";
    const newer = "audit_20260101_000000.log";
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(dir, older), "old\n");
    await writeFile(path.join(dir, newer), "new\n");
    const file = await resolveLogFile(dir);
    expect(path.basename(file)).toBe(newer);
    void (await readdir(dir));
  });
});
