# R-036 staging scheduler evidence gate

Status: **BLOCKED / NOT EXECUTED**

This Cloud Agent environment has no Hire Me staging VM, systemd deployment access, or operator credentials. No staging journal excerpts, `systemctl` output, or deployment commit SHAs were captured for this pull request.

## What remains before R-036 can close

Complete the checklist in `docs/runbooks/task-reminder-scheduler.md` (section “Staging evidence gate”) on the real staging host, then attach sanitized proof to the closing PR or issue comment:

1. Deployed release/commit SHA on staging.
2. `systemctl status hire-me-reminders.timer` (or equivalent) showing the timer active.
3. At least one successful one-shot journal line with `event":"task_reminders.tick"` JSON.
4. Synthetic due reminder delivered without manual `POST /v1/tasks/reminders/process-due`.
5. Exactly one `Notification`, reminder `SENT` once, scheduler `TaskEvent` with null actor.
6. One `tasks.reminders_processed` AuditLog with null actor and count-only metadata.
7. Subsequent idle ticks do not duplicate delivery.
8. Lag fields (`backlogDue`, `oldestDueAgeSeconds`, `budgetExhausted`) visible and sane in the tick JSON.
9. Safe restart / missed-tick recovery demonstrated if practical.
10. No secrets or real personal/task content in GitHub artifacts.

Until that evidence exists, **R-036 stays open** even after PR C merges.
