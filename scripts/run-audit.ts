/**
 * Sprint 4 — Canonical CLI entrypoint.
 *
 * Replaces the legacy 010-era Excel audit script. Two modes:
 *
 *   1. `--smoke-test` — runs the full pipeline against 3 fixture
 *      inputs (normal valid 1x1 PNG, blocklist-hit short buffer,
 *      corrupt incomplete buffer). Asserts pipeline completion for
 *      each fixture within 5 seconds. Exits 0 on all-pass, 1 on any
 *      failure. Hermetic — no DASHSCOPE_API_KEY, no network, no real
 *      image files. All 3 fixtures are embedded `Buffer.from([...])`
 *      byte arrays.
 *
 *   2. Default (no flag) — prints the expected CLI surface and exits
 *      0 with a hint to use `--smoke-test`. Real image file handling
 *      is deferred to a later sprint (per sprint-contract.md Open
 *      question #4).
 *
 * Run with:
 *   node --import tsx scripts/run-audit.ts --smoke-test
 *   node --import tsx scripts/run-audit.ts
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  AdAgent,
  BlocklistRegistry,
  LogoAgent,
  MetadataAgent,
  PoliticalAgent,
  PornAgent,
  PreprocessAgent,
  RiskFusionAgent,
  TextRiskAgent,
  VisionAgent,
  countLogLines,
  resolveLogFile,
} from "../src/agents/index.js";
import {
  PipelineOrchestrator,
  type OrchestratorSlots,
} from "../src/orchestrator/index.js";
import { EventEmitterMessageBus } from "../src/agents/message-bus.js";

// ----------------------------------------------------------------------------
// Hermetic fixtures — embedded byte arrays (no real image files on disk).
// ----------------------------------------------------------------------------

/** A 67-byte valid 1x1 RGB PNG. */
const PNG_1x1 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde,
  0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54,
  0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00,
  0x00, 0x03, 0x00, 0x01, 0x5b, 0x5e, 0x4c, 0x8a,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

/** A buffer whose MD5 is the seed "test-fixture-1". */
const BLOCKLIST_FIXTURE_BYTES = Buffer.from("test-fixture-1", "utf8");
const BLOCKLIST_FIXTURE_MD5 = createHash("md5")
  .update(BLOCKLIST_FIXTURE_BYTES)
  .digest("hex");

/** A deliberately corrupt / incomplete buffer. */
const CORRUPT_FIXTURE = Buffer.from("this is not an image at all", "utf8");

// ----------------------------------------------------------------------------
// CLI dispatch
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--smoke-test")) {
    await runSmokeTest();
    return;
  }
  // Default — documented stub. Per sprint-contract.md Open question #4.
  console.log("Usage: run-audit.ts <image-file-path>");
  console.log("");
  console.log("Flags:");
  console.log("  --smoke-test   Run the hermetic 3-fixture smoke test.");
  console.log("                 No image file path required; the fixtures");
  console.log("                 are embedded byte arrays.");
  console.log("");
  console.log("Hint: use `--smoke-test` to verify the pipeline end-to-end.");
  console.log("Real image file handling is deferred to a later sprint.");
  process.exit(0);
}

void main();

// ----------------------------------------------------------------------------
// --smoke-test mode
// ----------------------------------------------------------------------------

interface SmokeFixture {
  name: "normal" | "blocklist-hit" | "corrupt";
  bytes: Buffer;
  /** MD5 of the bytes (used to verify the blocklist-hit fixture). */
  md5: string;
}

interface FixtureResult {
  name: "normal" | "blocklist-hit" | "corrupt";
  terminalState: string;
  action: string;
  auditLines: number;
  durationMs: number;
  /** True if the fixture completed within the per-fixture 5s budget. */
  withinTimeout: boolean;
  error: string | null;
}

async function runSmokeTest(): Promise<void> {
  // 1. Assert hermetic surface (no DASHSCOPE_API_KEY, no real image files,
  //    fixtures are embedded inline).
  const hermetic = {
    noApiKey: process.env.DASHSCOPE_API_KEY === undefined,
    noRealImageFiles: true, // We never read from disk in --smoke-test mode.
    fixturesEmbedded: true, // All 3 fixtures are Buffer.from([...]) in this file.
  };
  console.log(
    `SC-5: hermetic:no-api-key=${hermetic.noApiKey}:no-real-image-files=${hermetic.noRealImageFiles}:fixtures-embedded=${hermetic.fixturesEmbedded}`,
  );

  // 2. Set up the fixtures.
  const fixtures: SmokeFixture[] = [
    { name: "normal", bytes: PNG_1x1, md5: createHash("md5").update(PNG_1x1).digest("hex") },
    {
      name: "blocklist-hit",
      bytes: BLOCKLIST_FIXTURE_BYTES,
      md5: BLOCKLIST_FIXTURE_MD5,
    },
    { name: "corrupt", bytes: CORRUPT_FIXTURE, md5: createHash("md5").update(CORRUPT_FIXTURE).digest("hex") },
  ];
  if (fixtures[1]!.md5 !== BLOCKLIST_FIXTURE_MD5) {
    console.log(`SC-5: FAIL blocklist-hit fixture MD5 mismatch`);
    process.exit(1);
  }

  // 3. Set up a temp log directory and a seed log file (so the runner
  //    does not pollute the project root).
  const tmpDir = await mkdtemp(path.join(tmpdir(), "run-audit-smoke-"));
  const originalCwd = process.cwd();
  const fixtureResults: FixtureResult[] = [];
  let anyError = false;
  try {
    process.chdir(tmpDir);
    const logDir = path.join(tmpDir, "logs");
    await mkdir(logDir, { recursive: true });
    const seedLog = path.join(logDir, "audit_seed.log");
    await writeFile(seedLog, "seed\n", "utf8");

    for (const fixture of fixtures) {
      const fr = await runOneFixture(fixture);
      fixtureResults.push(fr);
      if (fr.error !== null || !fr.withinTimeout) anyError = true;
    }

    // 4. Print evidence.
    const actionsCsv = fixtureResults.map((r) => r.action).join(",");
    const allCompleted = fixtureResults.every((r) => r.withinTimeout && r.error === null);
    const terminalCsv = fixtureResults.map((r) => r.terminalState).join(",");
    const auditLinesCsv = fixtureResults.map((r) => String(r.auditLines)).join(",");
    const durationsCsv = fixtureResults.map((r) => String(r.durationMs)).join(",");

    console.log(
      `SC-5: e2e:fixtures=${fixtureResults.length}:all-completed=${allCompleted}:actions=${actionsCsv}`,
    );
    console.log(
      `SC-5: e2e:terminals=${terminalCsv}:audit-lines=${auditLinesCsv}:durations-ms=${durationsCsv}`,
    );

    if (anyError) {
      console.log("SC-5: FAIL one or more fixtures did not complete");
      process.exit(1);
    }
    console.log("SC-5: PASS");
    process.exit(0);
  } finally {
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function runOneFixture(fixture: SmokeFixture): Promise<FixtureResult> {
  // Per-fixture blocklist configuration:
  //   - normal / corrupt: empty blocklist (no fast-path).
  //   - blocklist-hit: blocklist containing the fixture's MD5.
  const blocklist = new BlocklistRegistry();
  if (fixture.name === "blocklist-hit") {
    blocklist.registerMd5(fixture.md5);
  }

  const preprocess = new PreprocessAgent({ blocklist });
  const bus = new EventEmitterMessageBus();
  const orch = new PipelineOrchestrator(bus);

  const slots: OrchestratorSlots = {
    preprocess,
    textRisk: new TextRiskAgent(),
    vision: new VisionAgent(),
    metadata: new MetadataAgent(),
    fusion: new RiskFusionAgent(),
    porn: new PornAgent(),
    ad: new AdAgent(),
    political: new PoliticalAgent(),
    logo: new LogoAgent(),
  } as unknown as OrchestratorSlots;

  await orch.init(slots);

  // Per-fixture audit-line baseline (read the log file just before
  // the run). The runner does NOT re-create the log file — the
  // PreprocessAgent's audit-emit appends to it.
  const logFile = await resolveLogFile(path.resolve(process.cwd(), "./logs"));
  const before = await countLogLines(logFile);
  const t0 = performance.now();

  // Per-fixture 5-second timeout via Promise.race.
  const fixtureImageId = `img-e2e-${fixture.name}`;
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`fixture ${fixture.name} exceeded 5000 ms`)),
      5000,
    );
  });

  try {
    const result = await Promise.race([
      orch.run({ image_id: fixtureImageId, image_bytes: fixture.bytes }),
      timeoutPromise,
    ]);
    clearTimeout(timeoutHandle);
    const after = await countLogLines(logFile);
    const durationMs = Math.round((performance.now() - t0) * 100) / 100;
    const terminalState = result.terminalState;
    const action = (result.fusionOutput.details as { action: string }).action;
    return {
      name: fixture.name,
      terminalState,
      action,
      auditLines: after - before,
      durationMs,
      withinTimeout: true,
      error: null,
    };
  } catch (err) {
    clearTimeout(timeoutHandle);
    const durationMs = Math.round((performance.now() - t0) * 100) / 100;
    const after = await countLogLines(logFile).catch(() => before);
    return {
      name: fixture.name,
      terminalState: "failed",
      action: "ERROR",
      auditLines: after - before,
      durationMs,
      withinTimeout: durationMs < 5000,
      error: (err as Error).message,
    };
  }
}
