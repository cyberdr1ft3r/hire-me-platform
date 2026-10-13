# Internal messaging V1 — retention and operational policy (proposed)

**Issue #190** (parent **#170**). **D-087** remains **Proposed**; this document does **not** accept D-087 or close #170.

Related design: `docs/design/messaging-v1-preflight.md` (especially §9 edit/withdraw, §13 maintainer decisions). Implementation reference: `apps/api/src/messaging/` (withdraw tombstone, no hard delete, no purge in V1).

This is **policy and runbook text only**. V1 has **no automated message deletion or retention purge**. Nothing here is legal advice.

---

## Document status

| Layer | Status |
| --- | --- |
| **Facts already accepted by D-087 / implemented V1 behavior** | Described in §2; unchanged by this draft. |
| **Recommended operational policy** | §3–§11; **Proposed — maintainer approval required** before broad production rollout. |
| **Decisions still requiring maintainer approval** | §12 checklist; retention period, owners, hold/export/backup procedures, staff notice. |

Until §12 is satisfied, production-readiness **must not** claim the D-087 retention gate is closed (R-054).

---

## 1. Data in scope

When a retention period and future purge are approved, the **messaging retention unit** includes:

| Store | Contents | Notes |
| --- | --- | --- |
| **Conversation** | Type (direct/group), title, lifecycle (`ACTIVE`/`ARCHIVED`), `lastMessageAt`, `lastMessageSequence`, direct key, audit-relevant timestamps | Conversation row is the natural purge boundary for a thread. |
| **ConversationMember** | Membership role, `historyAfterSequence`, `lastReadSequence`, join/leave/remove timestamps, hidden flag | Membership history informs who could see which sequences; purge must not corrupt sequence integrity for remaining members. |
| **Message** | `sequence`, `body`, `status` (`ACTIVE`/`EDITED`/`ARCHIVED` withdrawn), edit metadata, `clientMessageId`, author, timestamps | Withdrawn messages: **body retained in DB**; API returns tombstone (`body: null`, `withdrawn: true`). |
| **MessageRevision** | Prior bodies for edited messages (append-only) | Must be deleted with the parent message or in the same purge transaction; no orphan revisions. |
| **AuditLog (messaging events only)** | Metadata-only rows for conversation lifecycle, member changes, edits, withdrawals (no message bodies in audit metadata per D-087) | Retention may align with message retention or a **separate audit retention policy** if the organization already defines one; if they diverge, document both explicitly at approval time. |

**Out of scope for messaging retention:** `Notification` (V1 creates none for messages), `Document` / attachments (deferred in V1), business-record domains (candidates, missions, HR files) — chat is **not** the system of record for those decisions (D-087 §7).

---

## 2. Facts already accepted (D-087 / V1 implementation)

These are **not** new policy; they are constraints any approved retention/purge must respect.

1. **No hard delete in V1.** Authors may **withdraw** (message `status = ARCHIVED`); API hides content; DB keeps the body for auditability until an approved purge removes it.
2. **Withdrawal is not erasure.** UI/API present a tombstone; operators must not describe withdraw as “immediate deletion.”
3. **No automated purge in V1.** Storage continues until a separately reviewed purge implementation runs under an approved policy.
4. **No global message reader.** `SUPER_ADMIN` and other roles have **no** “list/read all conversations” capability; retention, hold, and export procedures **must not** introduce one.
5. **Access remains membership-scoped.** `messages:view` / `messages:create` + `userType = INTERNAL` + active membership + exclusive `historyAfterSequence` boundary (D-087).
6. **Moderation deferred.** No `messages:moderate` in V1; compliance access is via future, purpose-limited capability — not admin override.

---

## 3. Withdrawal vs retention

| Concern | Behavior |
| --- | --- |
| **User-facing** | Withdrawn messages show as withdrawn; `body` is null in API responses. |
| **Storage** | `Message.body` and related `MessageRevision` rows remain until retention expiry and an approved purge job (future). |
| **Retention clock** | **Proposed default:** retention anchors on **conversation activity** (see §4), not on withdraw. Withdrawal does **not** reset or shorten retention by itself. |
| **Staff guidance** | Internal training should state that withdraw hides content from colleagues but **does not** guarantee early destruction. |

---

## 4. Retention period (proposed — maintainer approval required)

### 4.1 Product and business context (non-legal)

Hire Me messaging V1 is **internal-only** (`userType = INTERNAL`), organization-wide among staff, plain text, used for operational coordination (recruitment, finance, HR-adjacent workflows). It may contain **confidential business or personal data** posted voluntarily by users (R-054). The platform already treats other HR/recruitment records as long-lived business data; chat is a **supplemental** channel, not a substitute for structured records (offers, evaluations, documents).

**This section does not state statutory retention obligations** for Morocco or any other jurisdiction. The organization’s **legal/compliance function** must confirm or adjust any period before production rollout.

### 4.2 Proposed default

**Proposed default retention: 36 months (3 years)** of **conversation inactivity**, measured from the conversation retention anchor (UTC):

```text
retentionAnchorAt = COALESCE(lastMessageAt, createdAt)
```

- **Rationale (operational, not legal):** Balances auditability and dispute reconstruction for internal business chat against storage and privacy exposure; aligns in order-of-magnitude with common internal “business communications” archive practice without claiming a specific legal minimum.
- **Purge unit:** When implemented, delete **entire conversations** (and all messages, revisions, and membership rows for that conversation) whose `retentionAnchorAt` is older than the retention cutoff, subject to §6 holds and §12 approval.
- **Inactive definition for eligibility:** `retentionAnchorAt` before the cutoff and conversation not under legal/incident hold.
- **Zero-message conversations:** `lastMessageAt` is nullable (e.g. a PRIVATE thread opened but never messaged, or a direct pair with only hide/metadata activity). **`COALESCE(lastMessageAt, createdAt)`** ensures those rows still become purge-eligible after the retention period unless held — they must not remain outside eligibility forever.

**Status: Proposed — maintainer approval required.** Do not mark D-087 retention Accepted until the maintainer records approval (§12).

### 4.2.1 Long-lived active threads (intentional tradeoff)

Retention is keyed to **conversation inactivity**, **not** individual message age. If participants keep sending messages, `lastMessageAt` (and thus `retentionAnchorAt`) stays recent, and the **whole conversation—including messages much older than 36 months—remains stored** until the thread goes inactive for the full retention period.

- This is an **intentional tradeoff** of the conversation-level model: simpler purge semantics and no partial history corruption, versus allowing very old messages to persist inside an still-active thread.
- **Do not** describe this policy as “each message is deleted 36 months after it was sent.”
- Maintainer and **legal/compliance** must explicitly accept this tradeoff when approving §4.2 (§12 checklist).

### 4.3 Reasonable alternatives (for maintainer choice)

| Option | Period | Tradeoff |
| --- | --- | --- |
| **A (proposed default)** | **36 months** after `COALESCE(lastMessageAt, createdAt)` | Moderate archive; long-lived active threads may retain messages older than 36 months (§4.2.1). |
| **B (shorter)** | **24 months** after `COALESCE(lastMessageAt, createdAt)` | Less storage and exposure; same long-lived-thread behavior as §4.2.1. |
| **C (longer)** | **84 months (7 years)** after `COALESCE(lastMessageAt, createdAt)` | Longer inactivity window before purge; **not** asserted as legally required for chat. |
| **D (message-level)** | **36 months** after each `Message.createdAt` | Finer-grained deletion within a thread; **higher implementation risk** (partial history, sequence gaps, member visibility anomalies). **Not recommended** unless legal/compliance explicitly requires it and purge design is reviewed separately. |

If the maintainer selects an alternative, record the chosen option, anchor field, and effective date in project memory **after** approval (not in this draft alone).

### 4.4 What retention does **not** mean today

- Indefinite retention is **not** the approved policy; it is the **temporary V1 default** until purge + approved period exist.
- Changing this document alone does **not** delete data or change D-087 status.

---

## 5. Ownership (roles/functions)

No personal names are required; assign named individuals outside Git.

| Function | Responsibility |
| --- | --- |
| **Platform operations owner** | Day-to-day production health: backups, migrations, deploy ordering, executing approved exports/holds, running future purge jobs, maintaining this runbook after approval, escalation to engineering for defects. *Maps to the same operational function described in `docs/runbooks/production-readiness-d068-d070.md` (repository maintainer / deploy operator role).* |
| **Legal / compliance / data-protection owner** | Approves retention period, hold scope, export purpose, privacy/data-subject handling, and any jurisdiction-specific requirements; approves staff notices where needed. *Organization role (e.g. legal counsel, compliance officer, DPO-equivalent) — not a Hire Me product permission.* |
| **Engineering (on request)** | Designs and implements a future purge feature in a **separate reviewed issue**; does not unilaterally set retention period. |

**Proposed assignment for maintainer confirmation:**

- **Operational owner:** **Platform operations owner** (production runbook function).
- **Legal/compliance escalation:** **Organization legal/compliance and data-protection function** (external to RBAC; escalations via internal contact path recorded at approval time).

---

## 6. Legal / incident hold

### 6.1 Purpose

Suspend **future** messaging deletion (purge) for scoped conversations while an investigation, dispute, or legal matter is active — **without** granting participants or admins universal read access to unrelated chats.

### 6.2 Hold model (operational, V1)

V1 has **no hold flag in the database**. Until schema support exists (future issue), holds are **operational records**:

- **Hold register** (ticket system or restricted ops document): conversation UUID(s), reason category (incident / legal / regulatory), **opened** date, **expected review** date, approver (legal/compliance function), linked ticket id.
- **Effect:** Approved future purge job **must skip** any conversation id on the active hold register.
- **Access:** Placing a hold does **not** grant `messages:view` to anyone who lacks membership. **Historical investigation and compliance access to message content is export-only (§7):** approved conversation-scoped export or controlled break-glass under legal/compliance direction — **not** a super-admin backdoor.
- **Do not add investigators as conversation members for historical access.** PRIVATE direct membership is **immutable** (Issue #188 / #192); adding someone changes collaboration state and does **not** grant retroactive history. GROUP late join uses an exclusive `historyAfterSequence` boundary (`sequence > historyAfterSequence` only), so a new member **cannot** read pre-join history even if added for an investigation.

### 6.3 Release

Legal/compliance owner clears the hold when the matter closes; platform operations removes the register entry; conversation becomes eligible for purge on the next run **after** retention age is satisfied.

---

## 7. Export procedure and authorization boundary

### 7.1 Who may request

- **Legal/compliance function** (subpoena, regulatory inquiry, serious incident).
- **Platform operations owner** (execution only, on written legal/compliance approval).
- **Line managers** do **not** receive a global export capability by default.

### 7.2 Authorization boundary

| Rule | Detail |
| --- | --- |
| **No global reader** | Export tooling must **not** add a route or role that lists/reads all messages. |
| **Conversation-scoped export only** | Exports must target **explicit conversation id(s)** on the hold/export register. **Compliance, legal, or incident investigation** that needs content the requester did not already see through normal membership must use **controlled break-glass export** (§7.3) under legal/compliance approval — not membership changes, not a global reader, and **not** `SUPER_ADMIN` by default. A member with existing access may export only what their membership already authorizes (same API scope); that is not a substitute for break-glass when history outside their window is required. |
| **Purpose limitation** | Each export records: requester (function), approver (legal/compliance), conversation ids, sequence range if partial, export date, storage location of artifact, destruction date for the export copy. |
| **Integrity** | Export artifact should include conversation metadata, messages (including withdrawn bodies if legally required — withdrawn still stored in DB), revisions for edited messages, and member list **without** exposing unrelated conversations. Prefer read-only, timestamped, checksum-logged files stored under confidential-backup controls. |
| **Audit** | Log export events in platform audit (metadata only, no bodies in audit rows if consistent with D-087). |

### 7.3 V1 practical note

Until automated export exists, approved exports may use **controlled database procedures** run by platform operations (read-only replica preferred), under legal/compliance written approval. Such access is **operational break-glass**, not a product feature, and must be rare and audited.

---

## 8. Future purge — design constraints only (no implementation)

A future purge implementation **must not** ship until:

- Retention period and owners are approved (§12).
- Legal/compliance signs off on hold and export interaction.
- Separate architecture/security review for the purge issue.

**Constraints for implementers:**

1. **No partial conversation corruption:** Prefer **whole-conversation delete** in one transaction after locking the conversation row; avoid deleting individual messages in a way that leaves incoherent sequence/history for remaining members.
2. **Order of deletion (conceptual):** `MessageRevision` → `Message` → `ConversationMember` → `Conversation`, respecting FKs; or equivalent cascade defined in migration with explicit review.
3. **Idempotency:** Re-running purge for the same conversation must be safe (already deleted → no-op).
4. **Batching:** Process in bounded batches with commit boundaries; avoid long single transactions that block messaging writes.
5. **Hold skip:** Conversations on the hold register are never selected.
6. **Withdrawn and edited content:** Purge removes stored bodies and revisions together; no “tombstone-only” partial state in DB after purge.
7. **AuditLog:** Decide at implementation whether messaging audit rows are deleted with the conversation or retained under a separate audit retention policy; document the choice in the purge issue and get legal/compliance input.
8. **Dry run:** First production cycles should support count/preview mode before destructive delete.
9. **No new read APIs:** Purge workers use service-role DB access; they do not expose message content to operators via UI unless under export procedure.
10. **Eligibility timestamp:** Select conversations where `COALESCE(lastMessageAt, createdAt)` is before the retention cutoff (and not on hold).

---

## 9. Backups and restore

### 9.1 Primary vs backup

Deleting messaging rows from the **primary PostgreSQL database does not** remove copies in:

- Point-in-time recovery / continuous backup (managed provider).
- Logical dumps (`pg_dump`) taken before purge.
- Off-site or immutable backup tiers.

Operators must assume **expired messaging data may still exist in backups** until those backups expire under the **infrastructure backup retention policy** (separate from messaging content retention).

### 9.2 Backup retention interaction

| Topic | Policy expectation |
| --- | --- |
| **Backup retention period** | Defined by platform/infrastructure policy (see production-readiness runbook backup sections); **may exceed** messaging content retention. |
| **Restoring an older backup** | Restoring a backup into production (or a clone wired to production clients) can **reintroduce** messaging data that was purged from primary. **Restored systems must not silently resurrect expired chat into active use** without reconciliation: either re-run purge after restore, or treat restored messaging as quarantined until ops/legal review. |
| **Clone / staging** | Non-production restores must use sanitized or isolated environments; messaging bodies are confidential (same as `messaging-legacy-rows.md` backup guidance). |
| **Export copies** | Subject to export register destruction dates; not governed by messaging DB retention alone. |

---

## 10. Privacy and data-subject requests (assumptions only)

**Not legal advice.** Jurisdiction-specific obligations (including Morocco) must be assessed by the **legal/compliance function**.

**Product/operational assumptions for V1:**

1. Messaging users are **internal staff** identified to the platform (accounts, not anonymous).
2. Chat may contain **third-party personal data** (candidates, clients) pasted by users; structured records may remain in candidate/client modules even if chat is purged.
3. **Withdraw** is not the same as erasure; erasure requests may require export review, legal assessment, and possibly manual redaction or purge ahead of schedule — under hold/export rules.
4. The platform does **not** automatically fulfill data-subject requests without human legal/compliance decision.
5. Correlation with other modules (tasks, documents) may be needed; messaging retention does not replace HR/file retention policies.

Escalation path: user or request → **legal/compliance owner** → platform operations for technical export/purge actions if approved.

---

## 11. Production rollout checklist (messaging retention gate)

Before claiming **broad production rollout** of messaging (D-087 retention gate, R-054), record completion:

| # | Gate | Owner | Done |
| --- | --- | --- | --- |
| 1 | **Retention period** chosen from §4 and recorded (default 36m inactivity after `COALESCE(lastMessageAt, createdAt)` or approved alternative); **long-lived active thread tradeoff (§4.2.1)** explicitly accepted | Maintainer + legal/compliance | ☐ |
| 2 | **Operational owner** and **legal/compliance escalation** contacts recorded | Maintainer | ☐ |
| 3 | **Hold procedure** (§6) approved; hold register location defined | Legal/compliance + platform ops | ☐ |
| 4 | **Export procedure** (§7) approved; no global reader introduced | Legal/compliance + security review | ☐ |
| 5 | **Backup/restore interaction** (§9) acknowledged by platform ops | Platform ops | ☐ |
| 6 | **Staff notice / training** decision (withdraw vs retention, confidential use) recorded | HR/comms + maintainer | ☐ |
| 7 | **Escalation path** for incidents and privacy requests documented | Legal/compliance | ☐ |
| 8 | **Automated purge** explicitly **not** claimed until separately implemented and reviewed | Engineering | ☐ |

Updating `docs/project/STATUS.md`, `HANDOFF.md`, `DECISIONS.md`, or `RISKS.md` happens **after** maintainer approval of this policy, not when this draft merges.

---

## 12. Summary for maintainer approval

**Approve explicitly:**

- Retention period option (§4.2 default **36 months** or alternative).
- Operational owner function and legal/compliance escalation function (§5).
- Hold register model and export boundary (§6–§7).
- Backup/restore expectations (§9).

**Do not approve via this issue alone:**

- D-087 status change to Accepted (broader messaging acceptance remains separate).
- #170 completion.
- Any automated purge deployment.

---

## References

- `docs/design/messaging-v1-preflight.md` §9, §13
- `docs/runbooks/messaging-legacy-rows.md` (confidential backup caution)
- `docs/project/DECISIONS.md` D-087 (Proposed)
- Risks R-053, R-054
