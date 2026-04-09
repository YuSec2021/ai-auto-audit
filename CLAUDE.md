# CLAUDE.md

## Execution Contract

Before making any code change, you MUST:

1. Read @AGENT.md
2. Follow the workflow in AGENT.md exactly
3. If AGENT.md conflicts with ad-hoc user requests, ask for clarification
4. Do not implement before:
   - spec exists (defines WHAT)
   - plan exists (defines HOW)
   - task is identified (defines EXECUTION UNIT)

## Required Workflow

```
SPECIFY → PLAN → TASKS → IMPLEMENT → EVALUATE → ITERATE
```

1. Read `@AGENT.md`
2. Read `@.specify/spec.md` — understand requirements
3. Read `@.specify/plan.md` — understand architecture
4. Read relevant files under `.specify/tasks/`
5. Implement only the current task
6. **Evaluate** output against spec before proceeding

## Harness Architecture (Core)

This project follows a **harness design** pattern for reliable execution:

```
┌─────────────────────────────────────────────────────────┐
│                    SPECIFICATION                        │
│  (Planner: expand requirements into structured spec)     │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│                     PLANNING                            │
│  (Derive architecture, define DONE criteria)            │
│  → Generate sprint contracts with hard thresholds        │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│                   EXECUTION                             │
│  (Generator: implement one task at a time)             │
│  (Evaluator: validate output against criteria)          │
└─────────────────────┬───────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│                   CHECKPOINT                            │
│  (Persist state, enable resume on failure)              │
└─────────────────────────────────────────────────────────┘
```

### Three-Agent Pattern

- **Planner**: Expands requirements into full specs, stays at high level
- **Generator**: Works in sprints, self-evaluates, uses version control
- **Evaluator**: Validates against criteria with hard thresholds

### Sprint Contracts

Before each sprint, negotiate what "done" looks like:
- Clear acceptance criteria
- Hard thresholds for quality gates
- Explicit exit conditions

## Completion Gate

Before marking work complete, you MUST:
- Run tests/lint defined in AGENT.md
- Validate output against spec criteria
- Summarize files changed
- List assumptions and decisions

## Anti-Failures

Two persistent failure modes this harness prevents:

1. **Context Collapse**: Context windows filling → use structured handoffs and checkpointing
2. **Self-Evaluation Bias**: Agents praising own mediocre work → separate generation from evaluation

---

*Based on Anthropic's "Harness Design for Long-Running Application Development"*
