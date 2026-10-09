import type {
  ClientContactSummary,
  InterviewRescheduleRequest,
  InterviewScheduleRequest,
  InterviewSummary,
} from '@hire-me/contracts';
import { useState, type FormEvent, type ReactNode } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Checkbox, InlineMessage, Select, StatusBadge, TextField } from '../ui/index.js';
import { ScrollTable, SectionStatus } from './MissionBits.js';
import type { MissionAccess } from './mission-access.js';
import {
  dateTimeFormValue,
  formValue,
  formValues,
  optionalDateTimeFormValue,
  optionalFormValue,
} from './mission-form.js';
import {
  INTERVIEW_FORMATS,
  INTERVIEW_TYPES,
  interviewFormatLabelKey,
  interviewStatusLabelKey,
  interviewStatusTone,
  interviewTypeLabelKey,
  isInterviewOpen,
} from './mission-labels.js';
import type { AccumulatedListState } from './mission-accumulated-list.js';
import { MissionLoadMorePagination } from './MissionLoadMorePagination.js';
import type { PickerOption, SectionState } from './mission-state.js';

export type InterviewAction = 'archive' | 'cancel' | 'complete' | 'postpone';

export interface MissionInterviewsModel {
  activeInterviewId: string | null;
  clientContactSearch: string;
  /** The mission client's active contacts; idle when they are not offered. */
  clientContacts: SectionState<AccumulatedListState<ClientContactSummary>>;
  interviews: SectionState<AccumulatedListState<InterviewSummary>>;
  onAction: (interview: InterviewSummary, action: InterviewAction) => void;
  onClientContactSearch: (search: string) => void;
  onLoadMoreClientContacts: () => void;
  onLoadMoreInterviews: () => void;
  onReschedule: (
    interview: InterviewSummary,
    input: InterviewRescheduleRequest,
  ) => Promise<boolean>;
  onRetry: () => void;
  onRetryLoadMoreClientContacts: () => void;
  onRetryLoadMoreInterviews: () => void;
  onRemoveSelectedClientContact: (contactId: string) => void;
  onSchedule: (input: InterviewScheduleRequest) => Promise<boolean>;
  onToggle: (interviewId: string) => void;
  onToggleClientContactParticipant: (contact: ClientContactSummary, selected: boolean) => void;
  selectedInterviewClientContacts: {
    displayName: string;
    id: string;
    roleTitle: string | null;
  }[];
}

export function MissionInterviews({
  access,
  clientVisible,
  editable,
  model,
  renderEvaluations,
  team,
  writesLocked,
}: {
  access: MissionAccess;
  /** Client interviews are only accepted once the candidate is presented. */
  clientVisible: boolean;
  editable: boolean;
  model: MissionInterviewsModel;
  renderEvaluations: (interview: InterviewSummary) => ReactNode;
  /** Active mission team members; null when the team cannot be read. */
  team: PickerOption[] | null;
  writesLocked: boolean;
}) {
  const { formatDateTime, t } = useI18n();
  const title = t('missions.interviews.title');
  const canOpenDetails = access.canViewEvaluations || (editable && access.canRescheduleInterviews);

  return (
    <section aria-labelledby="mission-interviews-title" className="mission-subsection">
      <h4 className="mission-subtitle" id="mission-interviews-title">
        {title}
      </h4>
      <SectionStatus onRetry={model.onRetry} section={model.interviews}>
        {(list) =>
          list.items.length === 0 ? (
            <p className="mission-muted">{t('missions.interviews.empty')}</p>
          ) : (
            <>
              <ScrollTable label={title}>
                <table className="mission-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('missions.interviews.columns.type')}</th>
                      <th scope="col">{t('missions.interviews.columns.schedule')}</th>
                      <th scope="col">{t('missions.interviews.columns.organizer')}</th>
                      <th scope="col">{t('missions.interviews.columns.status')}</th>
                      <th scope="col">{t('missions.interviews.columns.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.items.map((interview) => {
                      const expanded = interview.id === model.activeInterviewId;
                      return (
                        <tr data-selected={expanded} key={interview.id}>
                          <th scope="row">{t(interviewTypeLabelKey(interview.type))}</th>
                          <td className="u-tabular">
                            {t('missions.interviews.scheduleValue', {
                              start: formatDateTime(interview.scheduledStartAt),
                              timezone: interview.timezone,
                            })}
                          </td>
                          <td>{interview.organizerDisplayName}</td>
                          <td>
                            <StatusBadge tone={interviewStatusTone(interview.status)}>
                              {t(interviewStatusLabelKey(interview.status))}
                            </StatusBadge>
                          </td>
                          <td>
                            <InterviewActions
                              access={access}
                              canOpenDetails={canOpenDetails}
                              editable={editable}
                              expanded={expanded}
                              interview={interview}
                              model={model}
                              writesLocked={writesLocked}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollTable>
              <MissionLoadMorePagination
                labels={{
                  loadMore: t('missions.nestedPagination.loadMore'),
                  loadMoreFailed: t('missions.nestedPagination.loadMoreFailed'),
                  progress: (values) => t('missions.nestedPagination.progress', values),
                  region: t('missions.interviews.pagination.region'),
                }}
                list={list}
                onLoadMore={model.onLoadMoreInterviews}
                onRetryLoadMore={model.onRetryLoadMoreInterviews}
              />
              {list.items
                .filter((interview) => interview.id === model.activeInterviewId)
                .map((interview) => (
                  <InterviewDetail
                    access={access}
                    editable={editable}
                    interview={interview}
                    key={interview.id}
                    model={model}
                    writesLocked={writesLocked}
                  >
                    {access.canViewEvaluations ? renderEvaluations(interview) : null}
                  </InterviewDetail>
                ))}
            </>
          )
        }
      </SectionStatus>
      {editable && access.canScheduleInterviews ? (
        <ScheduleForm
          access={access}
          clientVisible={clientVisible}
          model={model}
          team={team}
          writesLocked={writesLocked}
        />
      ) : null}
    </section>
  );
}

function InterviewActions({
  access,
  canOpenDetails,
  editable,
  expanded,
  interview,
  model,
  writesLocked,
}: {
  access: MissionAccess;
  canOpenDetails: boolean;
  editable: boolean;
  expanded: boolean;
  interview: InterviewSummary;
  model: MissionInterviewsModel;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const open = isInterviewOpen(interview);
  const name = t(interviewTypeLabelKey(interview.type));
  const action = (key: InterviewAction, label: string, variant: 'secondary' | 'danger') => (
    <Button
      aria-label={t('missions.actionFor', { action: label, name })}
      disabled={writesLocked}
      onClick={() => model.onAction(interview, key)}
      size="compact"
      variant={variant}
    >
      {label}
    </Button>
  );

  return (
    <div className="mission-actions mission-actions--row">
      {canOpenDetails ? (
        <Button
          aria-expanded={expanded}
          aria-label={t('missions.actionFor', {
            action: expanded
              ? t('missions.interviews.actions.hideDetails')
              : t('missions.interviews.actions.details'),
            name,
          })}
          onClick={() => model.onToggle(interview.id)}
          size="compact"
          variant={expanded ? 'primary' : 'secondary'}
        >
          {expanded
            ? t('missions.interviews.actions.hideDetails')
            : t('missions.interviews.actions.details')}
        </Button>
      ) : null}
      {editable && open && access.canCompleteInterviews
        ? action('complete', t('missions.interviews.actions.complete'), 'secondary')
        : null}
      {editable && open && interview.status !== 'POSTPONED' && access.canRescheduleInterviews
        ? action('postpone', t('missions.interviews.actions.postpone'), 'secondary')
        : null}
      {editable && open && access.canCancelInterviews
        ? action('cancel', t('missions.interviews.actions.cancel'), 'danger')
        : null}
      {editable && interview.status !== 'ARCHIVED' && access.canArchiveInterviews
        ? action('archive', t('missions.interviews.actions.archive'), 'danger')
        : null}
    </div>
  );
}

function InterviewDetail({
  access,
  children,
  editable,
  interview,
  model,
  writesLocked,
}: {
  access: MissionAccess;
  children: ReactNode;
  editable: boolean;
  interview: InterviewSummary;
  model: MissionInterviewsModel;
  writesLocked: boolean;
}) {
  const { formatDateTime, t } = useI18n();
  const titleId = `mission-interview-${interview.id}`;

  async function handleReschedule(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const done = await model.onReschedule(interview, {
      scheduledStartAt: dateTimeFormValue(data, 'scheduledStartAt'),
      scheduledEndAt: optionalDateTimeFormValue(data, 'scheduledEndAt'),
      timezone: formValue(data, 'timezone', 'UTC').trim() || 'UTC',
      reason: formValue(data, 'reason').trim(),
    });
    if (done) {
      form.reset();
    }
  }

  return (
    <section aria-labelledby={titleId} className="mission-interview">
      <h5 className="mission-minor-title" id={titleId}>
        {t(interviewTypeLabelKey(interview.type))} ·{' '}
        <span className="u-tabular">{formatDateTime(interview.scheduledStartAt)}</span>
      </h5>
      <p className="mission-muted">
        {t(interviewFormatLabelKey(interview.format))}
        {interview.location ? ` · ${interview.location}` : ''}
      </p>
      {editable && isInterviewOpen(interview) && access.canRescheduleInterviews ? (
        <form
          aria-label={t('missions.interviews.reschedule.title')}
          className="mission-form"
          onSubmit={(event) => void handleReschedule(event)}
        >
          <p className="mission-minor-title">{t('missions.interviews.reschedule.title')}</p>
          <div className="mission-form__grid">
            <TextField
              label={t('missions.interviews.schedule.start')}
              name="scheduledStartAt"
              required
              type="datetime-local"
            />
            <TextField
              label={t('missions.interviews.schedule.end')}
              name="scheduledEndAt"
              type="datetime-local"
            />
            <TextField
              defaultValue={interview.timezone}
              hint={t('missions.interviews.schedule.timezoneHint')}
              label={t('missions.interviews.schedule.timezone')}
              maxLength={80}
              name="timezone"
              required
            />
            <TextField
              label={t('missions.interviews.reschedule.reason')}
              maxLength={1000}
              name="reason"
              required
            />
          </div>
          <div className="mission-actions">
            <Button disabled={writesLocked} type="submit" variant="primary">
              {t('missions.interviews.reschedule.submit')}
            </Button>
          </div>
        </form>
      ) : null}
      {children}
    </section>
  );
}

function ScheduleForm({
  access,
  clientVisible,
  model,
  team,
  writesLocked,
}: {
  access: MissionAccess;
  clientVisible: boolean;
  model: MissionInterviewsModel;
  team: PickerOption[] | null;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const [organizerId, setOrganizerId] = useState('');
  const title = t('missions.interviews.schedule.title');
  const types = INTERVIEW_TYPES.filter(
    (type) => clientVisible || (type !== 'CLIENT_INTERVIEW_1' && type !== 'CLIENT_INTERVIEW_2'),
  );

  if (!team || team.length === 0) {
    return (
      <InlineMessage title={title} tone="info">
        <p className="mission-message__text">
          {team
            ? t('missions.interviews.schedule.noOrganizers')
            : t('missions.interviews.schedule.teamUnavailable')}
        </p>
      </InlineMessage>
    );
  }

  const organizer = team.some((member) => member.id === organizerId) ? organizerId : '';

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!organizer) {
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const type = types.find((entry) => entry === formValue(data, 'type')) ?? 'HR';
    const format =
      INTERVIEW_FORMATS.find((entry) => entry === formValue(data, 'format')) ?? 'VIDEO';
    const done = await model.onSchedule({
      type,
      scheduledStartAt: dateTimeFormValue(data, 'scheduledStartAt'),
      scheduledEndAt: optionalDateTimeFormValue(data, 'scheduledEndAt'),
      timezone: formValue(data, 'timezone', 'UTC').trim() || 'UTC',
      format,
      location: optionalFormValue(data, 'location'),
      meetingUrl: optionalFormValue(data, 'meetingUrl'),
      organizerUserId: organizer,
      internalUserParticipantIds: formValues(data, 'internalParticipant'),
      clientContactParticipantIds: model.selectedInterviewClientContacts.map(
        (contact) => contact.id,
      ),
      externalParticipants: [],
    });
    if (done) {
      form.reset();
      setOrganizerId('');
    }
  }

  return (
    <form
      aria-label={title}
      className="mission-form"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <h5 className="mission-minor-title">{title}</h5>
      <div className="mission-form__grid">
        <Select defaultValue="HR" label={t('missions.interviews.schedule.type')} name="type">
          {types.map((type) => (
            <option key={type} value={type}>
              {t(interviewTypeLabelKey(type))}
            </option>
          ))}
        </Select>
        <Select defaultValue="VIDEO" label={t('missions.interviews.schedule.format')} name="format">
          {INTERVIEW_FORMATS.map((format) => (
            <option key={format} value={format}>
              {t(interviewFormatLabelKey(format))}
            </option>
          ))}
        </Select>
        <TextField
          label={t('missions.interviews.schedule.start')}
          name="scheduledStartAt"
          required
          type="datetime-local"
        />
        <TextField
          label={t('missions.interviews.schedule.end')}
          name="scheduledEndAt"
          type="datetime-local"
        />
        <TextField
          defaultValue="UTC"
          hint={t('missions.interviews.schedule.timezoneHint')}
          label={t('missions.interviews.schedule.timezone')}
          maxLength={80}
          name="timezone"
          required
        />
        <Select
          hint={t('missions.interviews.schedule.organizerHint')}
          label={t('missions.interviews.schedule.organizer')}
          name="organizer"
          onChange={(event) => setOrganizerId(event.currentTarget.value)}
          required
          value={organizer}
        >
          <option value="">{t('missions.picker.choose')}</option>
          {team.map((member) => (
            <option key={member.id} value={member.id}>
              {member.label}
            </option>
          ))}
        </Select>
        <TextField
          label={t('missions.interviews.schedule.location')}
          maxLength={240}
          name="location"
        />
        <TextField
          label={t('missions.interviews.schedule.meetingUrl')}
          maxLength={500}
          name="meetingUrl"
          type="url"
        />
      </div>
      <fieldset className="mission-fieldset">
        <legend>{t('missions.interviews.schedule.internalParticipants')}</legend>
        <p className="ui-field__hint">
          {t('missions.interviews.schedule.internalParticipantsHint')}
        </p>
        {team.map((member) => (
          <Checkbox
            key={member.id}
            label={member.label}
            name="internalParticipant"
            value={member.id}
          />
        ))}
      </fieldset>
      {access.canViewClientContacts ? (
        <fieldset className="mission-fieldset">
          <legend>{t('missions.interviews.schedule.clientContacts')}</legend>
          <p className="ui-field__hint">{t('missions.interviews.schedule.clientContactsHint')}</p>
          <TextField
            hint={t('missions.interviews.schedule.clientContactsSearchHint')}
            label={t('missions.interviews.schedule.clientContactsSearch')}
            name="clientContactSearch"
            onChange={(event) => model.onClientContactSearch(event.currentTarget.value)}
            value={model.clientContactSearch}
          />
          {model.selectedInterviewClientContacts.length > 0 ? (
            <ul
              aria-label={t('missions.interviews.schedule.selectedClientContacts')}
              className="mission-selected-contacts"
            >
              {model.selectedInterviewClientContacts.map((contact) => (
                <li className="mission-selected-contacts__item" key={contact.id}>
                  <span>
                    {contact.displayName}
                    {contact.roleTitle ? (
                      <span className="mission-muted">{` · ${contact.roleTitle}`}</span>
                    ) : null}
                  </span>
                  <Button
                    aria-label={t('missions.interviews.schedule.removeClientContact', {
                      name: contact.displayName,
                    })}
                    disabled={writesLocked}
                    onClick={() => model.onRemoveSelectedClientContact(contact.id)}
                    size="compact"
                    type="button"
                    variant="secondary"
                  >
                    {t('missions.interviews.schedule.removeClientContactAction')}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <SectionStatus section={model.clientContacts}>
            {(contactList) =>
              contactList.items.length === 0 ? (
                <p className="mission-muted">
                  {t('missions.interviews.schedule.clientContactsEmpty')}
                </p>
              ) : (
                <>
                  {contactList.items.map((contact) => (
                    <Checkbox
                      checked={model.selectedInterviewClientContacts.some(
                        (entry) => entry.id === contact.id,
                      )}
                      hint={contact.roleTitle ?? undefined}
                      key={contact.id}
                      label={contact.displayName}
                      onChange={(event) =>
                        model.onToggleClientContactParticipant(contact, event.currentTarget.checked)
                      }
                    />
                  ))}
                  <MissionLoadMorePagination
                    labels={{
                      loadMore: t('missions.nestedPagination.loadMore'),
                      loadMoreFailed: t('missions.nestedPagination.loadMoreFailed'),
                      progress: (values) => t('missions.nestedPagination.progress', values),
                      region: t('missions.interviews.schedule.clientContactsPagination'),
                    }}
                    list={contactList}
                    onLoadMore={model.onLoadMoreClientContacts}
                    onRetryLoadMore={model.onRetryLoadMoreClientContacts}
                  />
                </>
              )
            }
          </SectionStatus>
        </fieldset>
      ) : null}
      <div className="mission-actions">
        <Button disabled={writesLocked || !organizer} type="submit" variant="primary">
          {t('missions.interviews.schedule.submit')}
        </Button>
      </div>
    </form>
  );
}
