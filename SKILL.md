---
name: error-memory
description: Prevent repeated mistakes by reviewing and recording verified errors, corrections, and project-specific gotchas in .learnings/. Use when a task may repeat earlier work, a command or tool fails, the user corrects an approach, or a reliable workaround is discovered.
---

# Error Memory

Maintain a small, evidence-backed memory of mistakes and their fixes so future Claude sessions can avoid repeating them.

## Before starting work

When the task is non-trivial or resembles earlier work:

1. Inspect `.learnings/LEARNINGS.md` and `.learnings/ERRORS.md` if they exist.
2. Search for entries related to the task's files, tools, error text, framework, or environment.
3. Treat entries marked `pending` or `in_progress` as hypotheses, not confirmed rules. Prefer entries marked `resolved`.
4. Apply relevant verified fixes before trying an approach that previously failed.

Do not load the entire learning history when a focused search is enough.

If `.learnings/` or either file does not exist, create the directory and the needed files with a short Markdown heading before recording the first verified entry.

## When something fails

1. Capture the exact error, the operation attempted, and the relevant context.
2. Search the learning files for the same or a similar failure before retrying.
3. Do not repeat the identical failed operation without a changed hypothesis or new evidence.
4. After the fix is verified, record the reusable lesson:
   - Put a command, tool, or environment failure in `.learnings/ERRORS.md`.
   - Put a corrected approach, project convention, or better method in `.learnings/LEARNINGS.md`.
5. If a matching entry already exists, update or link it and increase its recurrence count instead of creating noisy duplicates.

Use the existing files' entry format and unique IDs such as `ERR-YYYYMMDD-XXX` or `LRN-YYYYMMDD-XXX`. Mark an entry `resolved` only after the proposed fix has actually worked.

For a new learning file, use this minimum format:

```markdown
## [ERR-YYYYMMDD-XXX] operation-name
**Logged**: ISO-8601 timestamp
**Priority**: low | medium | high | critical
**Status**: pending | resolved
**Area**: frontend | backend | infra | tests | docs | config

### Summary
One-line description.

### Error
The smallest useful redacted error excerpt.

### Context
What was attempted and where.

### Suggested Fix
The verified or suspected next step.

### Metadata
- Reproducible: yes | no | unknown
- Related Files: relevant paths

---
```

For a corrected approach rather than a failed operation, use the same structure with an `LRN-...` ID and replace `Error` with `Details`.

## When the user corrects Claude

Record the correction as a learning when it is likely to matter again. State clearly:

- what the first approach got wrong;
- what the verified correct approach is;
- when it applies and when it does not.

Do not turn a one-off preference or an unverified guess into a general rule.

## Promote recurring lessons

When the same lesson recurs across tasks, or it is a stable project-wide convention, distill it into `CLAUDE.md` or another project instruction file when that file exists and changing it is within the task's scope. Keep the original learning entry and mark it as promoted. Prefer a short prevention rule over a long incident report.

## Privacy and quality

- Never store API keys, passwords, tokens, private user data, or full noisy logs.
- Redact sensitive values and keep only the smallest error excerpt needed to recognize the issue.
- Record verified, reusable knowledge rather than every transient failure.
- When an error is caused by external state, include that context so the lesson is not applied too broadly.
- At the end of a task, resolve or link any learning entries created during the work.

## Explicit use

When the user asks to remember a fix, review past mistakes, or avoid repeating an error, use this Skill directly and report which learning file was updated.

