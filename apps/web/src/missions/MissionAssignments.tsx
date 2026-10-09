import type { MissionAssignmentSummary } from '@hire-me/contracts';
import { useState, type FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Checkbox, Select, StatusBadge } from '../ui/index.js';
import { ScrollTable, SectionStatus } from './MissionBits.js';
import { MissionPicker, type LoadPickerOptions } from './MissionPicker.js';
import type { MissionAccess } from './mission-access.js';
import {
  ASSIGNABLE_ROLES,
  assignmentRoleLabelKey,
  assignmentStatusLabelKey,
  assignmentStatusTone,
  canBecomeLead,
} from './mission-labels.js';
import type { AccumulatedListState } from './mission-accumulated-list.js';
import { MissionLoadMorePagination } from './MissionLoadMorePagination.js';
import type { PickerOption, SectionState } from './mission-state.js';

type AssignableRole = MissionAssignmentSummary['role'];

export interface AssignmentCreateValues {
  user: PickerOption;
  role: AssignableRole;
  isLead: boolean;
}

export interface MissionAssignmentsModel {
  assignments: SectionState<AccumulatedListState<MissionAssignmentSummary>>;
  /** Assignment user options for one role; the endpoint omits users already in it. */
  loadUserOptions: (role: AssignableRole) => LoadPickerOptions;
  onArchive: (assignment: MissionAssignmentSummary) => void;
  onCreate: (values: AssignmentCreateValues) => Promise<boolean>;
  onDeactivate: (assignment: MissionAssignmentSummary) => void;
  onLoadMore: () => void;
  onMakeLead: (assignment: MissionAssignmentSummary) => void;
  onRetry: () => void;
  onRetryLoadMore: () => void;
}

export function MissionAssignments({
  access,
  model,
  sourceKey,
  writable,
  writesLocked,
}: {
  access: MissionAccess;
  model: MissionAssignmentsModel;
  sourceKey: string;
  writable: boolean;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const manage = access.canManageAssignments && writable;
  const title = t('missions.assignments.title');

  return (
    <section aria-label={t('missions.assignments.region')} className="mission-section">
      <h3 className="mission-section__title">{title}</h3>
      {access.canViewAssignments ? (
        <SectionStatus onRetry={model.onRetry} section={model.assignments}>
          {(list) =>
            list.items.length === 0 ? (
              <p className="mission-muted">{t('missions.assignments.empty')}</p>
            ) : (
              <>
                <ScrollTable label={title}>
                  <table className="mission-table">
                    <thead>
                      <tr>
                        <th scope="col">{t('missions.assignments.columns.member')}</th>
                        <th scope="col">{t('missions.assignments.columns.role')}</th>
                        <th scope="col">{t('missions.assignments.columns.status')}</th>
                        {manage ? (
                          <th scope="col">{t('missions.assignments.columns.actions')}</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {list.items.map((assignment) => (
                        <tr key={assignment.id}>
                          <th scope="row">{assignment.userDisplayName}</th>
                          <td>
                            <span className="mission-badges">
                              <span>{t(assignmentRoleLabelKey(assignment.role))}</span>
                              {assignment.isLead ? (
                                <StatusBadge tone="info">
                                  {t('missions.assignments.lead')}
                                </StatusBadge>
                              ) : null}
                            </span>
                          </td>
                          <td>
                            <StatusBadge tone={assignmentStatusTone(assignment.status)}>
                              {t(assignmentStatusLabelKey(assignment.status))}
                            </StatusBadge>
                          </td>
                          {manage ? (
                            <td>
                              <AssignmentActions
                                assignment={assignment}
                                model={model}
                                writesLocked={writesLocked}
                              />
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollTable>
                <MissionLoadMorePagination
                  labels={{
                    loadMore: t('missions.nestedPagination.loadMore'),
                    loadMoreFailed: t('missions.nestedPagination.loadMoreFailed'),
                    progress: (values) => t('missions.nestedPagination.progress', values),
                    region: t('missions.assignments.pagination.region'),
                  }}
                  list={list}
                  onLoadMore={model.onLoadMore}
                  onRetryLoadMore={model.onRetryLoadMore}
                />
              </>
            )
          }
        </SectionStatus>
      ) : null}
      {manage ? (
        <AssignmentCreateForm model={model} sourceKey={sourceKey} writesLocked={writesLocked} />
      ) : null}
    </section>
  );
}

function AssignmentActions({
  assignment,
  model,
  writesLocked,
}: {
  assignment: MissionAssignmentSummary;
  model: MissionAssignmentsModel;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const name = assignment.userDisplayName;
  return (
    <div className="mission-actions mission-actions--row">
      {canBecomeLead(assignment) ? (
        <Button
          aria-label={t('missions.actionFor', {
            action: t('missions.assignments.actions.makeLead'),
            name,
          })}
          disabled={writesLocked}
          onClick={() => model.onMakeLead(assignment)}
          size="compact"
          variant="secondary"
        >
          {t('missions.assignments.actions.makeLead')}
        </Button>
      ) : null}
      {assignment.status === 'ACTIVE' ? (
        <Button
          aria-label={t('missions.actionFor', {
            action: t('missions.assignments.actions.deactivate'),
            name,
          })}
          disabled={writesLocked}
          onClick={() => model.onDeactivate(assignment)}
          size="compact"
          variant="secondary"
        >
          {t('missions.assignments.actions.deactivate')}
        </Button>
      ) : null}
      {assignment.status !== 'ARCHIVED' ? (
        <Button
          aria-label={t('missions.actionFor', {
            action: t('missions.assignments.actions.archive'),
            name,
          })}
          disabled={writesLocked}
          onClick={() => model.onArchive(assignment)}
          size="compact"
          variant="danger"
        >
          {t('missions.assignments.actions.archive')}
        </Button>
      ) : null}
    </div>
  );
}

function AssignmentCreateForm({
  model,
  sourceKey,
  writesLocked,
}: {
  model: MissionAssignmentsModel;
  sourceKey: string;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const [role, setRole] = useState<(typeof ASSIGNABLE_ROLES)[number]>('RECRUITER');
  const [isLead, setIsLead] = useState(false);
  const [user, setUser] = useState<PickerOption | null>(null);
  const effectiveRole: AssignableRole = isLead ? 'LEAD_RECRUITER' : role;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!user) {
      return;
    }
    if (await model.onCreate({ user, role: effectiveRole, isLead })) {
      setUser(null);
      setIsLead(false);
    }
  }

  return (
    <form
      aria-label={t('missions.assignments.create.title')}
      className="mission-form"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <h4 className="mission-subtitle">{t('missions.assignments.create.title')}</h4>
      <div className="mission-form__grid">
        <Select
          disabled={isLead}
          label={t('missions.assignments.create.role')}
          name="role"
          onChange={(event) => {
            setRole(ASSIGNABLE_ROLES.find((entry) => entry === event.currentTarget.value) ?? role);
            setUser(null);
          }}
          value={isLead ? '' : role}
        >
          {isLead ? <option value="">{t(assignmentRoleLabelKey('LEAD_RECRUITER'))}</option> : null}
          {ASSIGNABLE_ROLES.map((entry) => (
            <option key={entry} value={entry}>
              {t(assignmentRoleLabelKey(entry))}
            </option>
          ))}
        </Select>
        <Checkbox
          checked={isLead}
          hint={t('missions.assignments.create.leadHint')}
          label={t('missions.assignments.create.lead')}
          name="isLead"
          onChange={(event) => {
            setIsLead(event.currentTarget.checked);
            setUser(null);
          }}
        />
      </div>
      <MissionPicker
        hint={t('missions.assignments.create.userHint')}
        label={t('missions.assignments.create.user')}
        loadOptions={model.loadUserOptions(effectiveRole)}
        onChange={setUser}
        required
        sourceKey={`${sourceKey}:assignment-user:${effectiveRole}`}
        value={user}
      />
      <div className="mission-actions">
        <Button disabled={writesLocked || !user} type="submit" variant="primary">
          {t('missions.assignments.create.submit')}
        </Button>
      </div>
    </form>
  );
}
