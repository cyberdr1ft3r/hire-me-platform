# Current Agent Handoff

Last updated: 2026-10-23

## Current situation

- Issue #236 métier terminology alignment is implemented on
  `feat/issue-236-metier-alignment`, based on `main`
  `685e28990ddd5b2fdd3f05044b8fd84af579e6a9`.
- `docs/metier/HIREME_METIER_GLOSSARY.md` consolidates the validated questionnaire terminology,
  separates Recrutement / Formation / Accompagnement, distinguishes présélection, shortlist,
  présentation au client, placement, and suivi post-intégration, and marks unresolved items pending.
- EN/FR presentation labels now distinguish **General candidate pool / Vivier général** from
  **Mission candidates / Candidats de la mission**. The singular task context is **Candidat de la
  mission**. Backend enums, database columns, APIs, transitions, permissions, navigation, B2 tabs,
  Training records, and `INDIVIDUAL_COACHING` are unchanged.
- The sixth official business-document title and the source files are not present in the repository;
  only the questionnaire responses supplied with the task are marked validated. This is tracked as
  R-060 rather than guessed.
- The before/after key matrix is in `docs/audit/issue-236-terminology-matrix.md`.
- All affected localization, Candidate, Mission, and App tests pass (232/232), as do formatting,
  architecture/style checks, lint, typecheck, and the production build. The full Windows web run
  passes 1,111/1,113 tests: its parallel Commercial focus failure passes alone, and its remaining
  failure is a pre-existing CRLF-sensitive CSS assertion in an unchanged file.

## Next concrete action

1. Review the draft PR terminology and exact-head CI results.
2. Identify the sixth official business document and validate pending English translations and
   operational mappings with the founder before any further label or workflow change.
3. Keep the PR draft and unmerged; do not deploy.

## Completion conditions

- Focused localization, Candidates, and Missions tests plus repository format, architecture, lint,
  typecheck, test, and build gates are green on the exact PR head.
- Human review confirms the validated wording and accepts or revises the pending source gaps.
- No backend contract, persistence, workflow, permission, navigation, Training classification, or
  Accompagnement implementation is introduced by this PR.
