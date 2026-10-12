# Task reminder scheduler operations (R-036 / D-088 PR C)

Automatic in-app task reminders are delivered by a **standalone one-shot worker** (`reminders:run-due`), not by the HTTP API. PostgreSQL row locks provide correctness; the host scheduler only triggers periodic runs.

Related design: `docs/design/r-036-task-reminder-scheduler-preflight.md`, decision **D-088**.

Example systemd units (templates only): `docs/runbooks/examples/task-reminder/`.

Staging evidence status: `docs/runbooks/task-reminder-scheduler-staging-evidence.md` (**BLOCKED / NOT EXECUTED** from agent environments).

## Components

| Piece | Role |
| --- | --- |
| `TaskReminderDeliveryService.runDueTick` | Delivery engine (PR A). One short transaction per reminder. |
| `apps/api/dist/jobs/run-due-reminders.js` | One-shot CLI worker (PR B). Nest application context, no HTTP. |
| systemd timer + oneshot service | **Preferred** production trigger (this runbook). |
| cron + `flock` | Fallback waste reducer; DB locking still authoritative. |
| `--loop` mode | Secondary option for container-only hosts with supervision elsewhere. |

## Environment (narrow worker)

The worker loads **`DATABASE_URL`** and **`NODE_ENV`** only (`loadWorkerEnvironment`). Do **not** put JWT secrets, refresh pepper, CORS, or storage settings in the worker environment file.

Example `/etc/hire-me/reminders.env` (permissions `0600`, root or `hire-me`):

```bash
DATABASE_URL=postgresql://…
NODE_ENV=production
```

Never commit credentials or production URLs to Git.

## Build and release ordering

1. Deploy API and worker from the **same release** (shared Prisma client and schema).
2. Run **`pnpm --filter @hire-me/api prisma:migrate deploy`** (or your release equivalent) **before** the first worker tick of the new version.
3. Ensure PostgreSQL is reachable (`After=network-online.target postgresql.service` in systemd).
4. Prefer database `TimeZone=UTC` at the server level; eligibility uses injected UTC instants, not session `NOW()`.

## Preferred: systemd one-shot + timer

Conceptual units: **`hire-me-reminders.service`** (oneshot) and **`hire-me-reminders.timer`** (every minute).

Templates: `docs/runbooks/examples/task-reminder/hire-me-reminders.service.example` and `hire-me-reminders.timer.example`.

Adjust paths on the host:

| Setting | Direction |
| --- | --- |
| `Type=` | `oneshot` |
| `ExecStart=` | `node /opt/hire-me/apps/api/dist/jobs/run-due-reminders.js --once` |
| `TimeoutStartSec=` | `55` (tick must finish within ~one minute cadence) |
| `EnvironmentFile=` | `/etc/hire-me/reminders.env` |
| Timer `OnCalendar=` | `*-*-* *:*:00` |
| Timer `AccuracySec=` | `1s` |

Install (operator commands; paths may differ):

```bash
sudo cp hire-me-reminders.service.example /etc/systemd/system/hire-me-reminders.service
sudo cp hire-me-reminders.timer.example /etc/systemd/system/hire-me-reminders.timer
# Edit ExecStart, User, WorkingDirectory, EnvironmentFile for the host.
sudo systemctl daemon-reload
sudo systemctl enable --now hire-me-reminders.timer
```

Inspect safely (no secrets in default JSON summary):

```bash
systemctl status hire-me-reminders.timer
systemctl list-timers hire-me-reminders.timer
journalctl -u hire-me-reminders.service -n 20 --no-pager
```

Manual one-shot diagnostic on the host:

```bash
sudo -u hire-me env $(grep -v '^#' /etc/hire-me/reminders.env | xargs) \
  node /opt/hire-me/apps/api/dist/jobs/run-due-reminders.js --once
```

Expected: exit **0**, one stdout JSON line `event":"task_reminders.tick"`, counts only (no task titles, emails, or connection strings).

### Missed ticks and catch-up

If a timer firing is skipped (host down, long maintenance), the **next** run processes all eligible due reminders (subject to per-tick `limit`). No in-memory state is required. Multi-host timers are safe: overlapping runs coordinate via PostgreSQL `FOR UPDATE SKIP LOCKED`.

### Rollback / disable

```bash
sudo systemctl disable --now hire-me-reminders.timer
sudo systemctl stop hire-me-reminders.service   # if a run is in flight; wait for current tick to finish
```

Revert the deployment artifact to the previous release, run `migrate deploy` if needed, re-enable the timer. Manual manager diagnostic (`POST /v1/tasks/reminders/process-due`) remains available for break-glass batches.

Wire **`OnFailure=`** to your existing alert unit when the **process exits non-zero** (bootstrap/DB failure). Per-reminder transient failures recorded in the database do **not** fail the one-shot exit code.

## Cron fallback

Use only when systemd timers are unavailable. `flock` avoids pile-up; correctness still comes from the database:

```cron
* * * * * flock -n /run/hire-me-reminders.lock /usr/bin/node /opt/hire-me/apps/api/dist/jobs/run-due-reminders.js --once
```

## Container-only loop mode (secondary)

Not the default for VM deployments:

```bash
node dist/jobs/run-due-reminders.js --loop --interval-seconds=60
```

Requires external supervision (restart policy, liveness). SIGTERM/SIGINT finish the current tick, abort inter-tick sleep, close Prisma, then exit.

## Observability

### JSON tick summary (stdout / journal)

Each completed tick emits one line including delivery counts and lag fields:

- `backlogDue` — eligible `PENDING` reminders at tick instant (backoff respected).
- `oldestDueAgeSeconds` — age of oldest eligible reminder; **0** when none.
- `budgetExhausted` — `true` when eligible reminder backlog **or** overdue backlog exceeds the tick page size (more work may remain this minute).

### AuditLog

Action **`tasks.reminders_processed`**, one row per **material** tick (delivery, cancellation, failure recording, overdue notification side effects, or `failureNotRecorded > 0` — a delivery failure whose recorder also failed, leaving the reminder `PENDING` without its attempt). **Idle** ticks (only `skippedLocked` / `skippedStale` / `overdueSkippedLocked`, or no state change) write **no** row.

- Scheduler: `actorUserId` **null** (system).
- Manual diagnostic: manager user id + request IP/user-agent when available.
- `metadataSummary`: JSON **counts only** (same numeric fields as audit metadata builder in code).

### Alerting guidance

| Signal | Action |
| --- | --- |
| `oldestDueAgeSeconds > 600` | Scheduler lag — investigate timer, DB connectivity, or worker errors. |
| systemd unit **failed** / runner exit **non-zero** | Page/on-call; bootstrap or DB unreachable. |
| Per-reminder transient failures in tick JSON | Monitor trend; does not fail the one-shot process. |

Do not log task titles, bodies, recipient email, or arbitrary exception text in production tick output.

## Database role (future hardening)

The worker currently uses the same application database role as the API. A dedicated least-privilege role is **not** introduced in PR C: recipient eligibility requires reads on users, roles, assignments, and task visibility in addition to writes on reminders, notifications, events, and audit logs. Document and implement a narrowed role only after the exact query footprint is frozen and deployment ownership exists.

## Staging evidence gate

R-036 closes only after real staging proof. See checklist in `docs/runbooks/task-reminder-scheduler-staging-evidence.md`. Do not mark the risk mitigated in project memory until that gate passes.

## Manager UI diagnostic

The Task Pipeline exposes a **collapsed manual diagnostic** for managers with `tasks:reminders:manage` and `tasks:view_all`. It does **not** mean the host scheduler is configured; it runs the same engine once via HTTP for troubleshooting.
