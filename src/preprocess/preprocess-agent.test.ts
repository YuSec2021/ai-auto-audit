/**
 * Unit tests for src/preprocess/preprocess-agent.ts.
 *
 * Covers:
 *   - PNG input → output has width, height, format, hash
 *   - Blocklist MD5 hit → score: 1.0, reason: "blocklist-hit"
 *   - Blocklist pHash hit → score: 1.0, reason: "blocklist-hit"
 *   - Corrupt input → reason: "preprocess-failed"
 *   - Agent self-emits an audit line (no orchestrator wrapper)
 *   - The bus event `pipeline.preprocess.blocklist-hit` is published
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  countLogLines,
  resolveLogFile,
  type MessageBus,
} from "../agents/index.js";
import { BlocklistRegistry } from "./blocklist.js";
import { PreprocessAgent } from "./preprocess-agent.js";
import { EventEmitterMessageBus } from "../agents/message-bus.js";
import { setMessageBus } from "../agents/message-bus.js";

/**
 * A 67-byte valid 1x1 RGB PNG (generated once, hardcoded). Width and
 * height are 1, format is PNG, MD5 is deterministic.
 */
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

/** Expected MD5 of the 1x1 PNG. */
const PNG_1x1_MD5 = createHash("md5").update(PNG_1x1).digest("hex");

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = mkdtempSync(path.join(tmpdir(), "preprocess-test-"));
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tmpDir, { recursive: true, force: true });
});

async function resolveLogFilePath(): Promise<string> {
  return resolveLogFile(path.resolve(process.cwd(), "./logs"));
}

describe("PreprocessAgent — happy path", () => {
  it("PNG input → output has format=png, width, height, hash (32-hex)", async () => {
    const bus: MessageBus = new EventEmitterMessageBus();
    setMessageBus(bus);
    const agent = new PreprocessAgent({ bus });
    await agent.init({});
    const out = await agent.run({
      image_id: "img-pp-test-1",
      image_bytes: PNG_1x1,
    });
    expect(out.image_id).toBe("img-pp-test-1");
    expect(out.score).toBe(0);
    expect(out.reason).toBe("ok");
    const details = out.details as {
      width: number;
      height: number;
      format: string;
      hash: string;
      metadata: { source?: string };
      fallback: string;
    };
    expect(details.width).toBeGreaterThan(0);
    expect(details.height).toBeGreaterThan(0);
    expect(details.format).toBe("png");
    expect(details.hash).toMatch(/^[0-9a-f]{32}$/);
    expect(details.hash).toBe(PNG_1x1_MD5);
    // `fallback` is one of the documented values; either is acceptable
    // depending on whether `sharp` happens to be installed.
    expect(["sharp", "manual"]).toContain(details.fallback);
  });

  it("the agent self-emits exactly one audit line per run()", async () => {
    const bus: MessageBus = new EventEmitterMessageBus();
    setMessageBus(bus);
    const agent = new PreprocessAgent({ bus });
    await agent.init({});
    const logFile = await resolveLogFilePath();
    const before = await countLogLines(logFile);
    await agent.run({ image_id: "img-audit-1", image_bytes: PNG_1x1 });
    const after = await countLogLines(logFile);
    expect(after - before).toBe(1);
  });
});

describe("PreprocessAgent — blocklist fast-path", () => {
  it("MD5 hit → score: 1.0, reason: blocklist-hit, bus event published", async () => {
    const bus: MessageBus = new EventEmitterMessageBus();
    setMessageBus(bus);
    const blocklist = new BlocklistRegistry();
    blocklist.registerMd5(PNG_1x1_MD5);
    const agent = new PreprocessAgent({ bus, blocklist });
    await agent.init({});

    const seen: string[] = [];
    bus.subscribe<unknown>("pipeline.preprocess.blocklist-hit", (msg) => {
      seen.push(msg.type);
    });

    const out = await agent.run({
      image_id: "img-bl-md5",
      image_bytes: PNG_1x1,
    });
    expect(out.score).toBe(1.0);
    expect(out.reason).toBe("blocklist-hit");
    const details = out.details as { hit_kind: string; hit_hash: string };
    expect(details.hit_kind).toBe("md5");
    expect(details.hit_hash).toBe(PNG_1x1_MD5);
    expect(seen).toContain("pipeline.preprocess.blocklist-hit");
  });

  it("pHash hit → score: 1.0, reason: blocklist-hit, hit_kind=phash", async () => {
    const bus: MessageBus = new EventEmitterMessageBus();
    setMessageBus(bus);
    const { pHash } = await import("./phash.js");
    const phashHex = pHash(PNG_1x1);
    const blocklist = new BlocklistRegistry();
    blocklist.registerPHashSeed(phashHex);
    const agent = new PreprocessAgent({ bus, blocklist });
    await agent.init({});
    const out = await agent.run({
      image_id: "img-bl-phash",
      image_bytes: PNG_1x1,
    });
    expect(out.score).toBe(1.0);
    expect(out.reason).toBe("blocklist-hit");
    const details = out.details as { hit_kind: string; hit_hash: string };
    expect(details.hit_kind).toBe("phash");
    expect(details.hit_hash).toBe(phashHex);
  });
});

describe("PreprocessAgent — failure modes", () => {
  it("corrupt (non-image) input → reason: preprocess-failed", async () => {
    const bus: MessageBus = new EventEmitterMessageBus();
    setMessageBus(bus);
    const blocklist = new BlocklistRegistry(); // empty
    const agent = new PreprocessAgent({ bus, blocklist });
    await agent.init({});
    const garbage = Buffer.from("this is not an image at all", "utf8");
    const out = await agent.run({
      image_id: "img-corrupt-1",
      image_bytes: garbage,
    });
    expect(out.score).toBe(0);
    expect(out.reason).toBe("preprocess-failed");
  });
});
