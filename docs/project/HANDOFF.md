# Current Agent Handoff

Last updated: 2026-07-21

This file tells the next human or agent exactly where to resume. Replace stale content instead of appending session transcripts.

## Current situation

- Issue #1 is still in progress.
- PR #4 is a draft product and architecture documentation pull request.
- A blocking review identified mismatches with confirmed client requirements.
- Codex has been instructed to correct PR #4.
- Issue #5 and PR #6 establish GitHub as the persistent project memory and agent handoff system.
- Issue #2 must not start until PR #4 is corrected, approved, and merged.

## Next actions

### Repository governance

Review and merge PR #6. Confirm that it adds:

- canonical project memory;
- goals, live status, roadmap, decisions, risks, and current handoff;
- the `project-memory` Codex skill;
- mandatory memory instructions in `AGENTS.md`;
- the reusable Codex issue template;
- explicit safeguards against storing secrets, CVs, production data, or confidential client evidence.

### Product foundation

Review the next update to PR #4 against:

1. The blocking PR review comment.
2. Issue #1 and all comments.
3. `PROJECT_MEMORY.md` after PR #6 is merged.
4. `docs/project/GOALS.md` after PR #6 is merged.
5. Confirmed client requirements represented in the corrected documentation.

Check especially:

- detailed candidate and mission workflows;
- multiple recruiters per mission;
- training participant or enrollment modeling;
- confirmed private messaging and discussion groups;
- the five confirmed dashboard indicators;
- commercial and HR document requirements;
- integrations and migration scale;
- French and English support;
- responsive web requirements;
- least-privilege permissions.

## Completion conditions

### PR #6

- Memory files are compact, accurate, non-confidential, and consistent.
- `AGENTS.md` requires future agents to read and maintain memory.
- PR #6 does not overwrite product documentation from PR #4.

### PR #4

- Every blocking review item is addressed.
- All Mermaid diagrams render.
- Terminology and relationships are consistent.
- No application or infrastructure code was added.
- The PR remains within issue #1 scope.
- Unresolved technical choices are clearly separated from confirmed product requirements.

## Mandatory rehydration checklist for every new agent

Before working:

- Read `AGENTS.md`.
- Read `PROJECT_MEMORY.md`.
- Read `docs/project/STATUS.md`.
- Read `docs/project/DECISIONS.md`.
- Read this handoff.
- Read the full assigned issue and all comments.
- Inspect relevant merged documentation and active pull requests.
- Load all materially applicable project skills, including `project-memory`.
- State the active skills and current source-of-truth understanding.

Before finishing:

- Update `STATUS.md`.
- Replace this handoff with the next concrete action.
- Update the decision and risk logs when applicable.
- Link the issue and pull request that support changes.
- Report checks performed and remaining blockers.