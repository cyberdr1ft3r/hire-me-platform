import type { TrainingSessionSummary } from '@hire-me/contracts';
import { useState, type FormEvent, type ReactNode } from 'react';

import { ListPagination } from '../clients/ListPagination.js';
import { useI18n } from '../i18n/index.js';
import {
  Button,
  Checkbox,
  EmptyState,
  InlineMessage,
  Select,
  Skeleton,
  StatusBadge,
  TextField,
} from '../ui/index.js';
import type { TrainingAccess } from './training-access.js';
import { DELIVERY_MODES, SESSION_STATUSES, sessionStatusTone } from './training-labels.js';
import {
  EMPTY_SESSION_FORM,
  hasActiveSessionFilters,
  type ListState,
  type LoadTrainingOptions,
  type PersonScope,
  type SessionFilterValues,
  type SessionFormValues,
} from './training-state.js';
import { SessionForm } from './SessionForm.js';
import { TrainingOptionPicker } from './TrainingOptionPicker.js';

export function TrainingSessions({
  access,
  appliedFilters,
  canSchedule,
  children,
  filters,
  list,
  loadTrainers,
  onApplyFilters,
  onCreate,
  onFiltersChange,
  onPage,
  onResetFilters,
  onRetry,
  onSelect,
  selectedId,
  sourceKey,
  writesLocked,
}: {
  access: TrainingAccess;
  appliedFilters: SessionFilterValues;
  canSchedule: boolean;
  children?: ReactNode;
  filters: SessionFilterValues;
  list: ListState<TrainingSessionSummary>;
  loadTrainers: LoadTrainingOptions;
  onApplyFilters: () => void;
  onCreate: (values: SessionFormValues) => Promise<boolean>;
  onFiltersChange: (values: SessionFilterValues) => void;
  onPage: (page: number) => void;
  onResetFilters: () => void;
  onRetry: () => void;
  onSelect: (session: TrainingSessionSummary) => void;
  selectedId: string | null;
  sourceKey: string;
  writesLocked: boolean;
}) {
  const { formatDateTime, t } = useI18n();
  const [draft, setDraft] = useState<SessionFormValues>(EMPTY_SESSION_FORM);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const filtered = hasActiveSessionFilters(appliedFilters);

  function submitFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onApplyFilters();
  }

  return (
    <section aria-labelledby="training-sessions-title" className="training-section training-block">
      <h2 className="training-block__title" id="training-sessions-title">
        {t('training.sessions.title')}
      </h2>

      {access.manageSessions && canSchedule ? (
        <details
          className="training-disclosure"
          onToggle={(event) => setScheduleOpen(event.currentTarget.open)}
          open={scheduleOpen}
        >
          <summary className="training-disclosure__summary">
            <h3 className="training-disclosure__title">{t('training.sessions.schedule')}</h3>
          </summary>
          <SessionForm
            access={access}
            loadTrainers={loadTrainers}
            mode="create"
            onChange={setDraft}
            onSubmit={() => {
              void onCreate(draft).then((created) => {
                if (created) {
                  setDraft(EMPTY_SESSION_FORM);
                  setScheduleOpen(false);
                }
              });
            }}
            sourceKey={sourceKey}
            values={draft}
            writesLocked={writesLocked}
          />
        </details>
      ) : null}

      <form
        aria-label={t('training.sessions.filters.region')}
        className="training-filters"
        onSubmit={submitFilters}
        role="search"
      >
        <div className="training-filters__controls">
          <TextField
            label={t('training.sessions.filters.search')}
            maxLength={120}
            onChange={(event) => onFiltersChange({ ...filters, search: event.currentTarget.value })}
            type="search"
            value={filters.search}
          />
          <Select
            label={t('training.sessions.filters.status')}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                status: event.currentTarget.value as SessionFilterValues['status'],
              })
            }
            value={filters.status}
          >
            <option value="">{t('training.filters.anyStatus')}</option>
            {SESSION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`training.status.session.${status}`)}
              </option>
            ))}
          </Select>
          <Select
            label={t('training.sessions.filters.deliveryMode')}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                deliveryMode: event.currentTarget.value as SessionFilterValues['deliveryMode'],
              })
            }
            value={filters.deliveryMode}
          >
            <option value="">{t('training.sessions.filters.anyDelivery')}</option>
            {DELIVERY_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(`training.deliveryMode.${mode}`)}
              </option>
            ))}
          </Select>
          <Select
            label={t('training.sessions.filters.trainer')}
            onChange={(event) => {
              const trainerScope = event.currentTarget.value as PersonScope;
              onFiltersChange({
                ...filters,
                trainerScope,
                trainer: trainerScope === 'selected' ? filters.trainer : null,
              });
            }}
            value={filters.trainerScope}
          >
            <option value="any">{t('training.filters.anyone')}</option>
            <option value="me">{t('training.sessions.filters.trainedByMe')}</option>
            {access.pickTrainers ? (
              <option value="selected">{t('training.filters.specificPerson')}</option>
            ) : null}
          </Select>
          {access.pickTrainers && filters.trainerScope === 'selected' ? (
            <TrainingOptionPicker
              hint={t('training.sessions.filters.trainerHint')}
              label={t('training.sessions.filters.trainerPerson')}
              loadOptions={loadTrainers}
              onChange={(trainer) => onFiltersChange({ ...filters, trainer })}
              sourceKey={`${sourceKey}:trainer-filter`}
              value={filters.trainer}
            />
          ) : null}
          <TextField
            label={t('training.sessions.filters.from')}
            onChange={(event) => onFiltersChange({ ...filters, from: event.currentTarget.value })}
            type="date"
            value={filters.from}
          />
          <TextField
            label={t('training.sessions.filters.to')}
            onChange={(event) => onFiltersChange({ ...filters, to: event.currentTarget.value })}
            type="date"
            value={filters.to}
          />
          <Checkbox
            checked={filters.includeArchived}
            label={t('training.sessions.filters.includeArchived')}
            onChange={(event) =>
              onFiltersChange({ ...filters, includeArchived: event.currentTarget.checked })
            }
          />
        </div>
        <div className="training-filters__actions">
          <Button disabled={list.status === 'loading'} size="compact" type="submit">
            {t('training.filters.apply')}
          </Button>
          {filtered || hasActiveSessionFilters(filters) ? (
            <Button onClick={onResetFilters} size="compact" variant="secondary">
              {t('training.filters.reset')}
            </Button>
          ) : null}
        </div>
      </form>

      {list.status === 'loading' || list.status === 'idle' ? (
        <div aria-busy="true">
          <Skeleton label={t('training.sessions.states.loading')} />
        </div>
      ) : list.status === 'error' ? (
        <InlineMessage announce title={t('training.sessions.states.errorTitle')} tone="danger">
          <p className="training-message__text">{t('training.sessions.states.error')}</p>
          <Button onClick={onRetry} size="compact" variant="secondary">
            {t('common.actions.retry')}
          </Button>
        </InlineMessage>
      ) : list.items.length === 0 ? (
        <EmptyState
          title={
            filtered
              ? t('training.sessions.empty.noMatchesTitle')
              : t('training.sessions.empty.noneTitle')
          }
        >
          {filtered ? t('training.sessions.empty.noMatches') : t('training.sessions.empty.none')}
        </EmptyState>
      ) : (
        <div className="training-list">
          <p aria-live="polite" className="training-list__count">
            {t('training.sessions.count', { count: list.total })}
          </p>
          <table aria-label={t('training.sessions.tableLabel')} className="training-table">
            <thead>
              <tr>
                <th scope="col">{t('training.sessions.columns.session')}</th>
                <th scope="col">{t('training.sessions.columns.schedule')}</th>
                <th scope="col">{t('training.sessions.columns.delivery')}</th>
                <th scope="col">{t('training.sessions.columns.trainer')}</th>
                <th scope="col">{t('training.sessions.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((session) => {
                const selected = session.id === selectedId;
                return (
                  <tr data-selected={selected ? 'true' : undefined} key={session.id}>
                    <th scope="row">
                      <button
                        aria-current={selected ? 'true' : undefined}
                        className="training-table__select"
                        onClick={() => onSelect(session)}
                        type="button"
                      >
                        {session.title}
                      </button>
                      {session.sequence !== null ? (
                        <span className="training-table__secondary">
                          {t('training.sessions.sequence', { number: session.sequence })}
                        </span>
                      ) : null}
                    </th>
                    <td className="u-tabular" data-label={t('training.sessions.columns.schedule')}>
                      <time dateTime={session.scheduledAt}>
                        {formatDateTime(session.scheduledAt)}
                      </time>
                    </td>
                    <td data-label={t('training.sessions.columns.delivery')}>
                      {t(`training.deliveryMode.${session.deliveryMode}`)}
                    </td>
                    <td data-label={t('training.sessions.columns.trainer')}>
                      {session.trainerDisplayName ?? (
                        <span className="training-muted">{t('training.common.unassigned')}</span>
                      )}
                    </td>
                    <td data-label={t('training.sessions.columns.status')}>
                      <StatusBadge tone={sessionStatusTone(session.status)}>
                        {t(`training.status.session.${session.status}`)}
                      </StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ListPagination
            labels={{
              next: t('training.pagination.next'),
              page: (values) => t('training.pagination.page', values),
              previous: t('training.pagination.previous'),
              range: (values) => t('training.pagination.range', values),
              region: t('training.sessions.paginationRegion'),
            }}
            onPage={onPage}
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
          />
        </div>
      )}

      {children}
    </section>
  );
}
