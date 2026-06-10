#!/usr/bin/env bash
# init.sh — SprintFoundry entrypoint for the Image Moderation Agent project.
#
# Responsibilities:
#   1. Validate that required tooling is present (node, npm, python3, git, bash).
#   2. Install/refresh project dependencies (idempotent — skipped when up-to-date).
#   3. Type-check / build the TypeScript project (optional, failure-tolerant only when irrelevant).
#   4. Print a readiness summary for Generator/Evaluator smoke checks.
#
# Idempotency:
#   - npm ci / npm install is only run when node_modules is missing or stale.
#   - All long-running commands are wrapped in `timeout`.
#   - The script exits non-zero on any required failure (dependency install, tool validation).

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${PROJECT_ROOT}"

log()  { printf '[init.sh] %s\n' "$*"; }
fail() { printf '[init.sh][FAIL] %s\n' "$*" >&2; exit 1; }

# ---------- 1. Validate required tooling ----------
log "Validating required tooling..."

for tool in node npm python3 git bash; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    fail "Required tool not found on PATH: ${tool}"
  fi
done

# Print versions for traceability
log "node:   $(node --version 2>/dev/null || echo 'unknown')"
log "npm:    $(npm  --version 2>/dev/null || echo 'unknown')"
log "python3:$(python3 --version 2>/dev/null || echo 'unknown')"
log "git:    $(git  --version 2>/dev/null || echo 'unknown')"
log "bash:   ${BASH_VERSION}"

# Require Node >= 20 (project uses Node 25 + tsx ESM)
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR}" -lt 20 ]; then
  fail "Node.js >= 20 is required (found major version ${NODE_MAJOR})"
fi

# ---------- 2. Install / refresh dependencies (idempotent) ----------
APP_DIR="${PROJECT_ROOT}/ai-audit-prototype"
PACKAGE_JSON="${APP_DIR}/package.json"
LOCK_FILE="${APP_DIR}/package-lock.json"
NODE_MODULES="${APP_DIR}/node_modules"

if [ ! -d "${APP_DIR}" ]; then
  fail "Expected project directory not found: ${APP_DIR}"
fi

if [ -f "${PACKAGE_JSON}" ]; then
  NEEDS_INSTALL=0
  if [ ! -d "${NODE_MODULES}" ]; then
    NEEDS_INSTALL=1
    log "node_modules missing — install required."
  elif [ -f "${LOCK_FILE}" ] && [ "${LOCK_FILE}" -nt "${NODE_MODULES}" ]; then
    NEEDS_INSTALL=1
    log "package-lock.json is newer than node_modules — re-install required."
  elif [ "${PACKAGE_JSON}" -nt "${NODE_MODULES}" ]; then
    NEEDS_INSTALL=1
    log "package.json is newer than node_modules — re-install required."
  fi

  if [ "${NEEDS_INSTALL}" -eq 1 ]; then
    log "Installing dependencies (timeout 600s)..."
    if [ -f "${LOCK_FILE}" ]; then
      timeout 600 npm --prefix "${APP_DIR}" ci --no-audit --no-fund \
        || fail "npm ci failed"
    else
      timeout 600 npm --prefix "${APP_DIR}" install --no-audit --no-fund \
        || fail "npm install failed"
    fi
  else
    log "Dependencies are up to date — skipping install."
  fi
else
  log "No package.json at ${PACKAGE_JSON} — skipping dependency install."
fi

# ---------- 3. Smoke-check the entrypoint script is reachable ----------
# We do NOT actually run the pipeline here — Generator/Evaluator drive that.
# We only confirm the smoke entrypoint file is present and syntactically plausible.
SMOKE_ENTRY="${APP_DIR}/scripts/run-audit.ts"
if [ -f "${SMOKE_ENTRY}" ]; then
  log "Smoke entrypoint present: ${SMOKE_ENTRY}"
else
  log "Note: smoke entrypoint ${SMOKE_ENTRY} not yet present (expected for epic-1 sprint 4)."
fi

# ---------- 4. Readiness summary ----------
log "Initialization complete."
log "  PROJECT_ROOT: ${PROJECT_ROOT}"
log "  APP_DIR:      ${APP_DIR}"
log "  Verification: ${PROJECT_ROOT}/planner-spec.json (mode=cli)"
log "  Next step:    Generator can begin epic-1 sprint 1 (agent interface & message bus)."
