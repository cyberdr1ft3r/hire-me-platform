# Workflows

Workflow state changes must be authorized on the backend, auditable when sensitive, and consistent with the entity names in `docs/domain-model.md`.

## Confirmed Requirement Versus Implementation Sequence

The stages below are confirmed product requirements. Implementation may be delivered module by module, but documents and code should not remove or silently aggregate the confirmed stages. Where normalized state names differ from questionnaire labels, the mapping is explicit.

## Candidate Pipeline

Candidate pipeline state is tracked on `MissionCandidate`, not on `Candidate`. This preserves candidate history across multiple recruitment missions.

### Confirmed Stage Mapping

| Confirmed stage | Normalized state |
| --- | --- |
| `NEW` | `new` |
| `CV_REVIEW` | `cv_review` |
| `HR_PRESELECTION` | `hr_preselection` |
| `HR_INTERVIEW_SCHEDULED` | `hr_interview_scheduled` |
| `HR_INTERVIEW_COMPLETED` | `hr_interview_completed` |
| `TECHNICAL_TEST` | `technical_test` |
| `INTERNAL_VALIDATION` | `internal_validation` |
| `PRESENTED_TO_CLIENT` | `presented_to_client` |
| `CLIENT_INTERVIEW_1` | `client_interview_1` |
| `CLIENT_INTERVIEW_2` | `client_interview_2` |
| `CLIENT_OFFER` | `client_offer` |
| `ACCEPTED` | `accepted` |
| `INTEGRATED` | `integrated` |
| `PROBATION_MONITORING` | `probation_monitoring` |
| `END_OF_PROBATION` | `end_of_probation` |
| `CLOSED` | `closed` |

### Exceptional and Outcome States

- `waiting`: waiting for information, availability, internal action, or client response.
- `on_hold`: intentionally paused.
- `postponed`: scheduled activity delayed.
- `candidate_declined`: candidate declined or refused to continue.
- `client_rejected`: client rejected the candidate.
- `withdrawn`: candidate withdrew from the mission.
- `talent_pool`: candidate is not active for this mission but should be retained for future opportunities.
- `archived`: retained but inactive.

### Terminal States

- `closed`
- `candidate_declined`
- `client_rejected`
- `withdrawn`
- `talent_pool`
- `archived`

`accepted`, `integrated`, `probation_monitoring`, and `end_of_probation` are not terminal by themselves because the confirmed process continues through integration, probation, and closure.

### Valid Transitions

```mermaid
stateDiagram-v2
    [*] --> new
    new --> cv_review
    cv_review --> hr_preselection
    cv_review --> talent_pool
    cv_review --> candidate_declined
    hr_preselection --> hr_interview_scheduled
    hr_preselection --> talent_pool
    hr_preselection --> candidate_declined
    hr_interview_scheduled --> hr_interview_completed
    hr_interview_scheduled --> postponed
    hr_interview_completed --> technical_test
    hr_interview_completed --> internal_validation
    technical_test --> internal_validation
    internal_validation --> presented_to_client
    internal_validation --> talent_pool
    presented_to_client --> client_interview_1
    presented_to_client --> client_rejected
    client_interview_1 --> client_interview_2
    client_interview_1 --> client_offer
    client_interview_1 --> client_rejected
    client_interview_2 --> client_offer
    client_interview_2 --> client_rejected
    client_offer --> accepted
    client_offer --> candidate_declined
    accepted --> integrated
    integrated --> probation_monitoring
    probation_monitoring --> end_of_probation
    end_of_probation --> closed
    new --> waiting
    cv_review --> waiting
    hr_preselection --> waiting
    internal_validation --> waiting
    presented_to_client --> waiting
    waiting --> cv_review
    waiting --> hr_preselection
    waiting --> presented_to_client
    waiting --> on_hold
    on_hold --> cv_review
    on_hold --> hr_preselection
    on_hold --> presented_to_client
    on_hold --> withdrawn
    postponed --> hr_interview_scheduled
    postponed --> client_interview_1
    postponed --> client_interview_2
    new --> withdrawn
    cv_review --> withdrawn
    hr_preselection --> withdrawn
    presented_to_client --> withdrawn
    client_offer --> withdrawn
    closed --> archived
    candidate_declined --> archived
    client_rejected --> archived
    withdrawn --> archived
    talent_pool --> archived
    closed --> [*]
    candidate_declined --> [*]
    client_rejected --> [*]
    withdrawn --> [*]
    talent_pool --> [*]
    archived --> [*]
```

## Recruitment Mission Pipeline

Recruitment mission state is tracked on `RecruitmentMission`. Candidate-specific progress is tracked on `MissionCandidate`, but the mission state should reflect the overall recruitment process.

### Confirmed Stage Mapping

| Confirmed mission stage | Normalized state |
| --- | --- |
| Brouillon | `draft` |
| Validation interne | `internal_validation` |
| Active | `active` |
| Fiche de poste validée | `job_description_approved` |
| Sourcing des candidats | `candidate_sourcing` |
| Présélection RH | `hr_preselection` |
| Entretiens RH | `hr_interviews` |
| Tests techniques | `technical_tests` |
| Présentation des candidats | `candidate_presentation` |
| Entretiens client | `client_interviews` |
| Sélection finale | `final_selection` |
| Offre envoyée | `offer_sent` |
| Candidat intégré | `candidate_integrated` |
| Suivi période d'essai | `probation_monitoring` |
| Mission clôturée | `closed_with_recruitment` or `closed_without_recruitment` |

### Exceptional and Outcome States

- `waiting_for_client_information`: blocked pending client details or decision.
- `paused`: intentionally paused or suspended.
- `canceled`: canceled before completion.
- `closed_without_recruitment`: closed with no successful placement.
- `closed_with_recruitment`: closed after successful placement.
- `deadline_expired_without_renewal`: deadline expired and the mission was not renewed.
- `archived`: retained but inactive.

### Terminal States

- `closed_with_recruitment`
- `closed_without_recruitment`
- `deadline_expired_without_renewal`
- `canceled`
- `archived`

### Confirmed Closure Reasons

`closureReason` is required or strongly recommended when a mission closes. Confirmed business reasons are:

- `client_closed_or_canceled`: the client closed or canceled the mission.
- `closed_without_recruitment`: the mission ended without recruitment.
- `deadline_expired_without_renewal`: the deadline expired and was not renewed.
- `positions_filled_and_candidates_integrated`: all planned positions are filled and candidates are integrated, optionally after probation validation.

Successful closure with recruitment must consider `numberOfPositions` and filled-placement count. Issue #19 implements the structured closure reasons as `CLIENT_CLOSED_OR_CANCELED`, `CLOSED_WITHOUT_RECRUITMENT`, `DEADLINE_EXPIRED_WITHOUT_RENEWAL`, and `POSITIONS_FILLED_AND_CANDIDATES_INTEGRATED` in shared contracts and Prisma while preserving the lowercase business values in database mappings.

### Valid Transitions

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> internal_validation
    internal_validation --> active
    internal_validation --> waiting_for_client_information
    active --> job_description_approved
    job_description_approved --> candidate_sourcing
    job_description_approved --> waiting_for_client_information
    candidate_sourcing --> hr_preselection
    hr_preselection --> hr_interviews
    hr_interviews --> technical_tests
    technical_tests --> candidate_presentation
    candidate_presentation --> client_interviews
    client_interviews --> final_selection
    final_selection --> offer_sent
    offer_sent --> candidate_integrated
    offer_sent --> closed_without_recruitment
    candidate_integrated --> probation_monitoring
    probation_monitoring --> closed_with_recruitment
    waiting_for_client_information --> internal_validation
    waiting_for_client_information --> job_description_approved
    waiting_for_client_information --> candidate_presentation
    draft --> paused
    internal_validation --> paused
    active --> paused
    job_description_approved --> paused
    candidate_sourcing --> paused
    hr_preselection --> paused
    hr_interviews --> paused
    technical_tests --> paused
    candidate_presentation --> paused
    client_interviews --> paused
    final_selection --> paused
    offer_sent --> paused
    paused --> internal_validation
    paused --> active
    paused --> candidate_sourcing
    paused --> hr_preselection
    paused --> candidate_presentation
    paused --> canceled
    draft --> canceled
    internal_validation --> canceled
    active --> canceled
    job_description_approved --> canceled
    candidate_sourcing --> canceled
    hr_preselection --> canceled
    hr_interviews --> canceled
    technical_tests --> canceled
    candidate_presentation --> canceled
    client_interviews --> canceled
    final_selection --> canceled
    offer_sent --> canceled
    offer_sent --> deadline_expired_without_renewal
    candidate_sourcing --> deadline_expired_without_renewal
    candidate_presentation --> closed_without_recruitment
    closed_with_recruitment --> archived
    closed_without_recruitment --> archived
    deadline_expired_without_renewal --> archived
    canceled --> archived
    closed_with_recruitment --> [*]
    closed_without_recruitment --> [*]
    deadline_expired_without_renewal --> [*]
    canceled --> [*]
    archived --> [*]
```

Issue #19 enforces the transition graph above through the API. Non-terminal moves use `PATCH /v1/missions/:missionId/status`; terminal operational closure uses `POST /v1/missions/:missionId/close` with a structured closure reason; archival uses `POST /v1/missions/:missionId/archive` after closure or cancellation. Mission closure, archival, status changes, ordinary updates, assignment writes, assignment activation eligibility, lead-recruiter replacement, and effective salary-range validation use the same parent-mission PostgreSQL row lock so concurrent archival, closure, user lifecycle changes, or partial commercial updates cannot bypass invariants.

## Training Workflow

Training workflow uses `TrainingProgram`, `TrainingSession`, `TrainingEnrollment`, and `TrainingSessionParticipation`.

`TrainingProgram` owns the overall program lifecycle and can contain multiple sessions. `TrainingSession` owns one scheduled delivery event. `TrainingEnrollment` owns program-level participant registration, approval, optional payment, evaluation, certificate, satisfaction, coaching, and follow-up state. `TrainingSessionParticipation` owns per-session attendance and session-level participant outcomes.

### TrainingProgram States

- `program_draft`: program is being created.
- `program_active`: program is available for sessions and enrollment.
- `program_closed`: program is closed for new enrollment or delivery.
- `program_archived`: program is retained but inactive.

### TrainingSession States

- `session_planned`: session is being planned.
- `session_scheduled`: session date, trainer, and location or link are set.
- `session_in_progress`: session is active.
- `session_completed`: session delivery is complete.
- `session_postponed`: session is delayed and needs rescheduling.
- `session_canceled`: session will not happen.
- `session_archived`: session is retained but inactive.

### Enrollment States

- `registered`: participant registration exists.
- `approval_pending`: participant needs approval.
- `approved`: participant is approved.
- `payment_pending`: optional payment is pending.
- `enrolled`: participant is enrolled in the program.
- `evaluated`: evaluation outcome recorded.
- `individual_coaching`: individual coaching is active or scheduled.
- `certificate_issued`: certificate was issued.
- `satisfaction_recorded`: satisfaction assessment completed.
- `follow_up`: post-training follow-up is active.
- `closed`: participant training lifecycle is closed.
- `rejected`: registration was rejected.
- `canceled`: participant enrollment was canceled.

### TrainingSessionParticipation States

- `expected`: participant is expected for a session.
- `attended`: participant attended the session.
- `absent`: participant was absent.
- `excused`: participant absence is excused.
- `session_outcome_recorded`: session-level participant outcome is recorded.
- `participation_archived`: participation record is retained but inactive.

### Terminal States

- `closed`
- `rejected`
- `canceled`
- `program_archived`
- `session_archived`
- `participation_archived`

### Valid Program Transitions

```mermaid
stateDiagram-v2
    [*] --> program_draft
    program_draft --> program_active
    program_active --> program_closed
    program_closed --> program_archived
    program_archived --> [*]
```

### Valid Session Transitions

```mermaid
stateDiagram-v2
    [*] --> session_planned
    session_planned --> session_scheduled
    session_scheduled --> session_in_progress
    session_scheduled --> session_postponed
    session_scheduled --> session_canceled
    session_postponed --> session_scheduled
    session_postponed --> session_canceled
    session_in_progress --> session_completed
    session_completed --> session_archived
    session_canceled --> session_archived
    session_archived --> [*]
```

### Valid Enrollment Transitions

```mermaid
stateDiagram-v2
    [*] --> registered
    registered --> approval_pending
    approval_pending --> approved
    approval_pending --> rejected
    approved --> payment_pending
    approved --> enrolled
    payment_pending --> enrolled
    payment_pending --> canceled
    enrolled --> evaluated
    evaluated --> individual_coaching
    evaluated --> certificate_issued
    individual_coaching --> certificate_issued
    certificate_issued --> satisfaction_recorded
    satisfaction_recorded --> follow_up
    follow_up --> closed
    rejected --> [*]
    canceled --> [*]
    closed --> [*]
```

### Valid Session Participation Transitions

```mermaid
stateDiagram-v2
    [*] --> expected
    expected --> attended
    expected --> absent
    expected --> excused
    attended --> session_outcome_recorded
    absent --> session_outcome_recorded
    excused --> session_outcome_recorded
    session_outcome_recorded --> participation_archived
    participation_archived --> [*]
```

## Transition Rules

- Only authorized internal users can transition workflow states.
- Client users may provide feedback only where explicitly authorized; they should not directly control internal workflow state in the MVP.
- State transitions involving client presentation, rejection, withdrawal, talent pool, document sharing, offer, integration, probation, mission closure reason, archival, cancellation, enrollment approval, payment status, session attendance, certificate, and commercial data should be audited.
- Reopening terminal states is not supported in the MVP unless a later issue defines recovery rules.

## Assumptions

- State names are stable code identifiers for future implementation.
- Archival keeps records available for audits and reporting while hiding them from active operational views.
- Candidate-level availability can differ from `MissionCandidate` pipeline state.
- Mission state summarizes the overall recruitment process; candidate-specific progress remains on `MissionCandidate`.
- Training program state, training session state, enrollment state, and session participation state are separate because a program contains multiple sessions and each participant can have different per-session attendance.

## Unresolved Technical Choices

- Whether `MissionCandidate` can move backward to earlier active states and which roles can do that.
- Whether client feedback can create tasks automatically.
- Exact enum names for mission `closureReason`; structured closure reasons are confirmed.
- Whether payment status in `TrainingEnrollment` is operational tracking only or later integrates with accounting.
- Whether workflow state names become database enums or shared constants.

## Risks

- Allowing client users to drive internal states can compromise process control.
- Missing transition audit logs can weaken accountability for candidate, client, training, and commercial decisions.
- Reopening terminal states without clear rules can corrupt reporting.
- Aggregating confirmed stages would hide business process detail required for later tasks.

## Non-Goals

- No workflow engine implementation.
- No database enum definitions.
- No automation rules beyond documenting future background job needs.
