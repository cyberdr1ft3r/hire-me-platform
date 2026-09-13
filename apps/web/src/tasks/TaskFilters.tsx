import { useState } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select, TextField } from '../ui/index.js';
import {
  taskContextKindLabelKey,
  taskDueFilterLabelKey,
  taskPriorityLabelKey,
  taskSortLabelKey,
  taskStatusLabelKey,
} from './task-labels.js';
import {
  TASK_PRIORITIES,
  TASK_SORTS,
  TASK_STATUSES,
  hasTaskFilters,
  type LoadOptions,
  type PickerOption,
  type TaskAccess,
  type TaskContextKind,
  type TaskFilters,
  type TaskView,
} from './task-state.js';
import { SearchPicker } from './TaskPickers.js';

type Scope = 'all' | 'assignedToMe' | 'ownedByMe' | 'custom';

function scopeOf(filters: TaskFilters, meId: string): Scope {
  if (!filters.owner && !filters.assignee) return 'all';
  if (!filters.owner && filters.assignee?.id === meId) return 'assignedToMe';
  if (!filters.assignee && filters.owner?.id === meId) return 'ownedByMe';
  return 'custom';
}

/**
 * One functional toolbar over the Task list query. Every option maps to a
 * filter the API already supports; nothing is filtered in the browser.
 *
 * "Show" offers the everyday views (assigned to me, owned by me) and writes the
 * same owner/assignee filters the people pickers write, so the two never
 * disagree. Owner and assignee pickers use the Task people lookup and are only
 * offered to actors who may assign work.
 */
export function TaskFilterBar({
  access,
  appliedFilters,
  filters,
  loadOptions,
  me,
  onApply,
  onChange,
  onReset,
  optionsKey,
  view,
}: {
  access: TaskAccess;
  appliedFilters: TaskFilters;
  filters: TaskFilters;
  loadOptions: LoadOptions;
  me: PickerOption;
  onApply: () => void;
  onChange: (filters: TaskFilters) => void;
  onReset: () => void;
  optionsKey: string;
  view: TaskView;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const scope = scopeOf(filters, me.id);

  function setScope(next: Scope): void {
    if (next === 'assignedToMe') onChange({ ...filters, assignee: me, owner: null });
    else if (next === 'ownedByMe') onChange({ ...filters, assignee: null, owner: me });
    else if (next === 'all') onChange({ ...filters, assignee: null, owner: null });
  }

  return (
    <form
      aria-label={t('task.filters.region')}
      className="task-filters"
      data-density="internal-compact"
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
    >
      <div className="task-filters__row">
        <TextField
          label={t('task.fields.search')}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          type="search"
          value={filters.search}
        />
        <Select
          label={t('task.fields.view')}
          onChange={(event) => setScope(event.target.value as Scope)}
          value={scope}
        >
          <option value="all">{t('task.filters.scope.all')}</option>
          <option value="assignedToMe">{t('task.filters.scope.assignedToMe')}</option>
          <option value="ownedByMe">{t('task.filters.scope.ownedByMe')}</option>
          {scope === 'custom' ? (
            <option disabled value="custom">
              {t('task.filters.scope.custom')}
            </option>
          ) : null}
        </Select>
        <Select
          label={t('task.fields.due')}
          onChange={(event) =>
            onChange({ ...filters, due: event.target.value as TaskFilters['due'] })
          }
          value={filters.due}
        >
          <option value="">{t('task.filters.anyDue')}</option>
          <option value="dueSoon">{t(taskDueFilterLabelKey('dueSoon'))}</option>
          <option value="overdue">{t(taskDueFilterLabelKey('overdue'))}</option>
        </Select>
        <Select
          label={t('task.fields.priority')}
          onChange={(event) =>
            onChange({ ...filters, priority: event.target.value as TaskFilters['priority'] })
          }
          value={filters.priority}
        >
          <option value="">{t('task.filters.anyPriority')}</option>
          {TASK_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {t(taskPriorityLabelKey(priority))}
            </option>
          ))}
        </Select>
        {view === 'list' ? (
          <Select
            label={t('task.fields.status')}
            onChange={(event) =>
              onChange({ ...filters, status: event.target.value as TaskFilters['status'] })
            }
            value={filters.status}
          >
            <option value="">{t('task.filters.anyStatus')}</option>
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(taskStatusLabelKey(status))}
              </option>
            ))}
          </Select>
        ) : null}
        <Select
          label={t('task.fields.sort')}
          onChange={(event) =>
            onChange({ ...filters, sort: event.target.value as TaskFilters['sort'] })
          }
          value={filters.sort}
        >
          {TASK_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {t(taskSortLabelKey(sort))}
            </option>
          ))}
        </Select>
      </div>

      {expanded ? (
        <div className="task-filters__more">
          {access.canAssign ? (
            <>
              <SearchPicker
                emptyLabel={t('task.filters.anyone')}
                hint={t('task.picker.searchPeopleHint')}
                label={t('task.fields.owner')}
                loadOptions={loadOptions}
                onChange={(owner) => onChange({ ...filters, owner })}
                source={{ purpose: 'owner', type: 'person' }}
                sourceKey={`${optionsKey}:filter-owner`}
                value={filters.owner}
              />
              <SearchPicker
                emptyLabel={t('task.filters.anyone')}
                hint={t('task.picker.searchPeopleHint')}
                label={t('task.fields.assignee')}
                loadOptions={loadOptions}
                onChange={(assignee) => onChange({ ...filters, assignee })}
                source={{ purpose: 'assignee', type: 'person' }}
                sourceKey={`${optionsKey}:filter-assignee`}
                value={filters.assignee}
              />
            </>
          ) : null}
          <TextField
            label={t('task.fields.dueFrom')}
            onChange={(event) => onChange({ ...filters, dueFrom: event.target.value })}
            type="date"
            value={filters.dueFrom}
          />
          <TextField
            label={t('task.fields.dueTo')}
            onChange={(event) => onChange({ ...filters, dueTo: event.target.value })}
            type="date"
            value={filters.dueTo}
          />
          {access.contextKinds.length ? (
            <ContextFilter
              filters={filters}
              kinds={access.contextKinds}
              loadOptions={loadOptions}
              onChange={onChange}
              optionsKey={optionsKey}
            />
          ) : null}
        </div>
      ) : null}

      <div className="task-filters__actions">
        <Button size="compact" type="submit">
          {t('task.actions.applyFilters')}
        </Button>
        <Button
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          size="compact"
          variant="quiet"
        >
          {expanded ? t('task.actions.fewerFilters') : t('task.actions.moreFilters')}
        </Button>
        {hasTaskFilters(appliedFilters) || hasTaskFilters(filters) ? (
          <Button onClick={onReset} size="compact" variant="quiet">
            {t('task.actions.reset')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function ContextFilter({
  filters,
  kinds,
  loadOptions,
  onChange,
  optionsKey,
}: {
  filters: TaskFilters;
  kinds: readonly TaskContextKind[];
  loadOptions: LoadOptions;
  onChange: (filters: TaskFilters) => void;
  optionsKey: string;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<TaskContextKind | ''>(filters.context?.kind ?? '');

  return (
    <div className="task-filters__context">
      <Select
        label={t('task.filters.contextKind')}
        onChange={(event) => {
          const next = event.target.value as TaskContextKind | '';
          setKind(next);
          onChange({ ...filters, context: null });
        }}
        value={kind}
      >
        <option value="">{t('task.filters.anyRecord')}</option>
        {kinds.map((entry) => (
          <option key={entry} value={entry}>
            {t(taskContextKindLabelKey(entry))}
          </option>
        ))}
      </Select>
      {kind ? (
        <SearchPicker
          emptyLabel={t('task.filters.anyRecord')}
          hint={t('task.picker.searchRecordsHint')}
          label={t(taskContextKindLabelKey(kind))}
          loadOptions={loadOptions}
          onChange={(option) => onChange({ ...filters, context: option ? { kind, option } : null })}
          source={{ kind, type: 'record' }}
          sourceKey={`${optionsKey}:filter-context:${kind}`}
          value={filters.context?.kind === kind ? filters.context.option : null}
        />
      ) : null}
    </div>
  );
}
