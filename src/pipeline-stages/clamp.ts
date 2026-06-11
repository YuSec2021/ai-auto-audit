/**
 * Sprint 5 — Per-layer clamp helper extracted from orchestrator.ts.
 *
 * Pure utility: clamp a per-layer score to the [0, 1] interval so
 * the fusion weighted sum is bounded. NaN / non-finite values are
 * treated as 0.0 (so a misbehaving agent cannot poison the sum).
 *
 * Byte-identical to the original orchestrator.ts:92-97 implementation.
 */
export function clampToFusionUnit(n: number): number {
  if (typeof n !== "number" || Number.isNaN(n) || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
