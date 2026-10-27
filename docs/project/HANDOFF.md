# Current Agent Handoff

Last updated: 2026-10-27

## Current situation

- `feat/client-libre-invoices` is based on `main` `a46458b852aa4a8ad275100e47a9a2a1057a270a` and implements standalone manual-client invoice creation without creating a CRM client.
- The UI preserves both registered and manual form values while switching. Manual name is required; address, ICE, and IF are optional at draft creation. Existing issuance requirements still require the complete approved buyer/seller/payment snapshot before issue.
- Invoice `clientId` is nullable only for standalone records with a stored buyer legal name. Manual invoices cannot link registered-client sources. Generated PDFs and protected generated-document reads use the immutable invoice buyer snapshot.
- Focused contract, UI, PostgreSQL create/issue/reload, and real-PDF tests pass. No deployment or real invoice issuance occurred.

## Next concrete action

1. Review the final diff and exact-head CI for the standalone invoice branch.
2. Confirm that excluding manual-client invoices from registered-client allocations/balances is the intended accounting boundary.
3. Merge only with explicit approval; deployment and production invoice issuance remain separate protected decisions.

## Completion conditions

- The review branch remains unmerged until exact-head CI and review are green.
- Registered-client invoice behavior and existing authorization/numbering/legal rules remain unchanged.
- No environment gate is bypassed, automatic deployment remains disabled, and real invoice issuance remains disabled.
