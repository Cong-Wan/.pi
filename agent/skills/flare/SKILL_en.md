---
name: flare
description: Use when you have a spec or requirements for a multi-step task, before touching code

---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, complete implementation code, test code, docs they might need to check, and exact commands to run. Give them the whole plan as bite-sized tasks. DRY. YAGNI. Plan-Driven.

Each task follows a strict sequence: **implement first, then write tests to verify the implementation matches the plan's stated goal.** Tests are not written to drive the implementation — they are written to confirm it. A task is not complete until every test passes. The engineer must not proceed to the next task until the current task's tests are all green.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the flare skill to create the implementation plan."

**Save plans to:** `docs/flare/YYYYMMDD_<topic>.md`

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during recipe skill. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

------

### Task N: [Short descriptive name]

**Goal:** One sentence stating exactly what this task achieves, written in terms of observable behavior or system state — not in terms of code written.

**Files touched:**

- `path/to/implementation.ts` — what this file does
- `path/to/implementation.test.ts` — what this test file covers

------

#### Step 1 — Implement

Write the complete implementation. No ellipsis. No `// ... rest of function`. No `// TODO`. Every line the engineer needs must be present.

```typescript
// path/to/implementation.ts
// Full file content here — imports, types, logic, exports
```

------

#### Step 2 — Write tests based on the plan goal

Write tests that verify the implementation satisfies the **Goal** stated at the top of this task. Tests must:

- Be complete and copy-pasteable as-is (include imports, test data, fixtures, mocks)
- Assert the behaviors described in the Goal — not implementation internals
- Cover the primary success case, at least one edge case, and at least one failure/error case if applicable

```typescript
// path/to/implementation.test.ts
// Full test file content here — imports, describe block, all test cases with assertions
```

------

#### Step 3 — Run tests and confirm all pass

```bash
$ <exact command to run only this task's tests>
# Expected output:
#   PASS path/to/implementation.test.ts
#   ✓ [test name] (Xms)
#   ✓ [test name] (Xms)
#   Test Suites: 1 passed, 1 total
#   Tests: N passed, N total
```

If any test fails, fix the **implementation** — do not delete or weaken the test. Repeat until all tests are green.

------

✅ **Done when:** Every test in Step 3 is green . **Do not start the next task until this condition is met.**

------

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:

- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases" — write the actual code
- "Write tests for the above" without providing the actual test code
- "Similar to Task N" — repeat the full code; the engineer may be reading tasks out of order
- Steps that describe what to do without showing how — code blocks are required for every code step
- References to types, functions, or methods not defined in any task in this plan
- Test code that uses `// mock this` or `// assert something` as placeholders

------

## Remember

- Exact file paths in every task, every step
- Complete code in every step — if a step touches code, show the entire relevant code
- Exact terminal commands with exact expected output
- Tests verify the Goal, not the code structure
- DRY, YAGNI, frequent commits
- If a task's Goal is too broad to test in one test file, split the task

------

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps. If a requirement has no corresponding task, add the task.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix every one before saving.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug waiting to happen. Reconcile all mismatches.

**4. Test completeness:** For every task (Task 1 onward), verify:

- The test covers all behaviors described in that task's **Goal**
- The test code is complete and runnable — not pseudocode or a sketch
- There is at least one edge case or failure case tested where applicable
- The ✅ Done condition is explicit and unambiguous

Fix any issues inline. No need to re-review after fixing — just correct and move on.

------

## Execution Handoff

After saving the plan, offer execution choice:

**"Plan complete and saved to `docs/flare/<filename>.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?"**

**If Subagent-Driven chosen:**

- **REQUIRED SUB-SKILL:** Use subagent-driven-development
- Fresh subagent per task + two-stage review

**If Inline Execution chosen:**

- **REQUIRED SUB-SKILL:** Use executing-plans
- Batch execution with checkpoints for review