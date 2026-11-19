# Executive Dashboard V1

Product direction: [Issue #234](https://github.com/cyberdr1ft3r/hire-me-platform/issues/234). The worktree is stacked on the recruitment acceptance draft. The top navigation feature commit `9f62850` is already an ancestor. Administration navigation has its own draft #264. The dashboard changes the Home content through the existing console switch; no shell, route, tab history, or navigation guard changes.

## Data and authorization

| Widget | Authoritative data | Scope and semantics |
| --- | --- | --- |
| Active missions, pipeline, progression, confirmed placements, bottlenecks | Recruitment reporting summary | Existing current counts. Broad oversight uses the existing transfer permission; other reporting users see active mission assignments only. “Active” is the Reporting definition of open work, which excludes Draft and terminal states. “Inactive pipeline” is the Reporting threshold, not a new policy. |
| Application deadlines | Recruitment reporting summary, additive field | At most five open missions over the next seven days, from the same server-side filtered mission set. Only title, deadline and ID are returned. Closed and unassigned missions are excluded for scoped actors. |
| Upcoming interviews | Agenda with a seven-day window and interview source | Scheduled items the actor organizes or attends, after the Agenda interview permission and mission scope checks. This is a personal schedule. |
| Tasks requiring attention | Tasks overdue and due-soon filters | Server determines both the status/date classification and which tasks the actor can see. Show at most five per category. |
| Recent activity | Recruitment reporting drilldown | Most recently created candidate processes within seven days, capped at five. Display mission and stage, not candidate identity. This is a process creation feed; it is not an audit log or a client activity feed. |

Executive home requires the complete existing Reporting view gate (six underlying operational reads and Reporting view). The client and API import the same contract constants. A principal with insufficient access receives the previous Overview; no widget calls are initiated. Each widget has its own loading and retry state and clears displayed data when the session token changes. Deep links use existing route permissions and navigation guards; destination APIs still enforce record scope. No financial, salary, commercial, or profitability metrics are rendered.

## Verification and follow-up

- Use a newly marked test database and `node scripts/functional-qa/run.mjs --test-name-pattern=executive-dashboard`. `pnpm test:e2e` runs all browser groups using independent API processes so each keeps the real authentication limiter.
- Browser acceptance covers the real EN landing, FR mobile view, empty schedule, synthetic interview/deadline/due task and recent process, one widget failure without suppressing healthy widgets, retry, session restoration, guarded drilldown and restricted fallback.
- Reporting integration checks that future closed and unassigned missions do not leak into an assigned recruiter's deadlines.
- No new grants. Cross-team interview calendars and configurable dashboards would need a separate product and access review.
