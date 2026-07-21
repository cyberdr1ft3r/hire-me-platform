---
name: project-memory
description: Maintain GitHub as the persistent source of truth for Hire Me project goals, status, decisions, risks, roadmap, and agent handoffs.
---

# Project Memory Skill

Use this skill for every meaningful repository task.

## Context rehydration

Before changing files:

1. Read `AGENTS.md`.
2. Read `PROJECT_MEMORY.md`.
3. Read `docs/project/STATUS.md`.
4. Read `docs/project/DECISIONS.md`.
5. Read `docs/project/HANDOFF.md`.
6. Read the assigned issue, all comments, and relevant active pull requests.
7. Read detailed product and architecture documents that apply to the task.
8. Identify conflicts and unresolved decisions instead of guessing.

## Source-of-truth hierarchy

Use this order when sources conflict:

1. Current approved issue and review comments.
2. Merged detailed documentation under `docs/`.
3. `docs/project/DECISIONS.md`.
4. `PROJECT_MEMORY.md` and `docs/project/STATUS.md`.
5. Older issues, PR summaries, and external conversation context.

## Update requirements

At the end of a meaningful task:

- Update `docs/project/STATUS.md` when work state, blockers, or next actions changed.
- Replace `docs/project/HANDOFF.md` with the next concrete action and completion conditions.
- Add accepted decisions to `docs/project/DECISIONS.md`.
- Update `docs/project/RISKS.md` when a risk changed or was discovered.
- Update `docs/project/ROADMAP.md` when sequencing or dependencies changed.
- Update `PROJECT_MEMORY.md` only for stable facts, goals, or operating rules.

## Memory quality rules

- Keep summaries factual, compact, and current.
- Do not paste chat transcripts, raw logs, full issue bodies, or speculative thoughts.
- Link claims to issues or pull requests where useful.
- Separate confirmed requirements, accepted decisions, current status, assumptions, and unresolved questions.
- Do not record secrets, credentials, personal data, CV content, production datasets, or confidential client evidence.
- Do not mark a decision accepted unless the maintainer approved it or it was accepted through review.
- Git history provides chronology; living status files should represent the current truth.

## Completion report

State which memory files were reviewed and updated. If no memory file changed, explain why the task had no effect on goals, status, decisions, risks, roadmap, or handoff.
