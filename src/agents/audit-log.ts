/**
 * Sprint 1 — Audit-log emission for agent runs.
 *
 * Writes one structured JSON line per agent.run() call to the
 * existing `./logs/audit_YYYYMMDD_HHMMSS.log` sink with the same
 * shape produced by the legacy audit_logger.js (CommonJS):
 *
 *   { timestamp, level, phase, message, context: { ...entry } }
 *
 * Per sprint-contract.md Risks §1, the new writer is a parallel
 * TypeScript implementation rather than a dynamic import of the
 * CommonJS module, to sidestep CJS↔ESM interop. The path and JSON
 * line format are identical, so the same `./logs/audit_*.log` files
 * are the single source of truth.
 */

import { appendFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

import type { AuditLogEntry } from "./types.js";

/** Default log directory (relative to the project root, where init.sh runs). */
const DEFAULT_LOG_DIR = "./logs";

/** Phase string used for every agent.run() audit line. */
const PHASE_AGENT_RUN = "AGENT_RUN";

/** Level string for normal agent audit lines. */
const LEVEL_INFO = "INFO";

/** Stable message key so log readers can grep on it. */
const MESSAGE_AGENT_AUDIT = "agent.audit";

/** Serialized audit line shape (mirrors audit_logger.js). */
interface SerializedAuditLine {
  timestamp: string;
  level: typeof LEVEL_INFO;
  phase: typeof PHASE_AGENT_RUN;
  message: typeof MESSAGE_AGENT_AUDIT;
  context: {
    image_id: string;
    agent: string;
    score: number;
    reason: string;
    elapsed_ms: number;
  };
}

/**
 * Format a YYYYMMDD_HHMMSS timestamp (matches audit_logger.js).
 */
function formatTimestampForFilename(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}${mo}${d}_${h}${mi}${s}`;
}

/**
 * Build a log filename for the current process-local "now" stamp.
 * Mirrors audit_logger.js's `audit_${timestamp}.log` convention.
 */
function buildLogFilename(now: Date = new Date()): string {
  return `audit_${formatTimestampForFilename(now)}.log`;
}

/**
 * Resolve the active log file:
 *   1. If `./logs/audit_*.log` already exists for today, append to it
 *      (mirrors audit_logger.js behavior — the file name is based on
 *      task-init time, but the writer appends for the task lifetime).
 *   2. Otherwise, create a new file with the current timestamp.
 *
 * We pick the newest existing log file in the directory to stay robust
 * against the orchestrator creating a task-scoped file earlier in the
 * process lifetime.
 */
export async function resolveLogFile(logDir: string): Promise<string> {
  const { readdir } = await import("node:fs/promises");
  let entries: string[] = [];
  try {
    entries = await readdir(logDir);
  } catch {
    // Directory does not exist; create it and start a fresh file.
    await mkdir(logDir, { recursive: true });
    return path.join(logDir, buildLogFilename());
  }
  const existing = entries
    .filter((name) => name.startsWith("audit_") && name.endsWith(".log"))
    .sort()
    .reverse();
  if (existing.length > 0) {
    return path.join(logDir, existing[0]!);
  }
  return path.join(logDir, buildLogFilename());
}

/**
 * Append one structured audit line for a single agent run.
 *
 * Best-effort: any I/O failure is logged to stderr but never thrown,
 * so the calling agent's run() is not derailed by a logger outage.
 *
 * @returns the absolute path of the file the line was appended to.
 */
export async function emitAgentAuditLog(entry: AuditLogEntry): Promise<string> {
  const logDir = path.resolve(process.cwd(), DEFAULT_LOG_DIR);
  await mkdir(logDir, { recursive: true });
  const logFile = await resolveLogFile(logDir);

  const line: SerializedAuditLine = {
    timestamp: new Date().toISOString(),
    level: LEVEL_INFO,
    phase: PHASE_AGENT_RUN,
    message: MESSAGE_AGENT_AUDIT,
    context: {
      image_id: entry.image_id,
      agent: entry.agent,
      score: entry.score,
      reason: entry.reason,
      elapsed_ms: entry.elapsed_ms,
    },
  };

  const serialized = JSON.stringify(line) + "\n";
  try {
    await appendFile(logFile, serialized, { encoding: "utf8" });
  } catch (err) {
    console.error(`[audit-log] failed to write to ${logFile}:`, err);
  }

  // Echo a one-line summary to stdout (consistent with audit_logger.js
  // which mirrors every entry to the console). This is intentional and
  // is the only stdout output the audit-log module produces.
  console.log(
    `[${line.level}] [${line.phase}] ${line.message} ${JSON.stringify(line.context)}`,
  );

  return logFile;
}

/**
 * Helper for the smoke test and for tests: count the number of lines
 * currently in a given log file. Returns 0 if the file does not exist.
 */
export async function countLogLines(logFile: string): Promise<number> {
  try {
    await stat(logFile);
  } catch {
    return 0;
  }
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(logFile, "utf8");
  if (content.length === 0) return 0;
  // Count trailing newlines; an empty trailing line still counts as 0 here.
  let count = 0;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) count++;
  }
  return count;
}
