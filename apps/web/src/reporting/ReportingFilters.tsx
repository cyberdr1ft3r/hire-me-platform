import type {
  ReportingClientBreakdownEntry,
  ReportingMissionBreakdownEntry,
  ReportingRecruiterBreakdownEntry,
} from '@hire-me/contracts';

import { useI18n } from '../i18n/index.js';
import { Button, Select, TextField } from '../ui/index.js';
import type { ReportingFilterValues } from './reporting-state.js';

export interface ReportingFiltersProps {
  busy: boolean;
  clients: readonly ReportingClientBreakdownEntry[];
  missions: readonly ReportingMissionBreakdownEntry[];
  onApply: () => void;
  onChange: (filters: ReportingFilterValues) => void;
  onReset: () => void;
  recruiters: readonly ReportingRecruiterBreakdownEntry[];
  values: ReportingFilterValues;
}

/**
 * The reporting filter toolbar.
 *
 * It exposes exactly the five filters this surface has always exposed. The
 * other server-supported filters stay unexposed: widening the interface would
 * change what the product asks for, which is a product decision rather than a
 * visual one.
 *
 * Option values are identifiers straight from the breakdown datasets. A
 * localized label is never used as a value, so nothing translated is ever sent
 * to the API.
 */
export function ReportingFilters({
  busy,
  clients,
  missions,
  onApply,
  onChange,
  onReset,
  recruiters,
  values,
}: ReportingFiltersProps) {
  const { locale, t } = useI18n();

  function update(patch: Partial<ReportingFilterValues>): void {
    onChange({ ...values, ...patch });
  }

  return (
    <form
      aria-label={t('reporting.filters.region')}
      className="reporting-filters"
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
    >
      <div className="reporting-filters__controls">
        <TextField
          lang={locale}
          label={t('reporting.filters.start')}
          onChange={(event) => update({ start: event.target.value })}
          type="date"
          value={values.start}
        />
        <TextField
          lang={locale}
          label={t('reporting.filters.end')}
          onChange={(event) => update({ end: event.target.value })}
          type="date"
          value={values.end}
        />
        <Select
          label={t('reporting.filters.client')}
          onChange={(event) => update({ clientId: event.target.value })}
          value={values.clientId}
        >
          <option value="">{t('reporting.filters.allClients')}</option>
          {clients.map((entry) => (
            <option key={entry.clientId} value={entry.clientId}>
              {entry.clientName}
            </option>
          ))}
        </Select>
        <Select
          label={t('reporting.filters.mission')}
          onChange={(event) => update({ missionId: event.target.value })}
          value={values.missionId}
        >
          <option value="">{t('reporting.filters.allMissions')}</option>
          {missions.map((entry) => (
            <option key={entry.missionId} value={entry.missionId}>
              {entry.missionTitle}
            </option>
          ))}
        </Select>
        <Select
          label={t('reporting.filters.recruiter')}
          onChange={(event) => update({ recruiterUserId: event.target.value })}
          value={values.recruiterUserId}
        >
          <option value="">{t('reporting.filters.allRecruiters')}</option>
          {recruiters.map((entry) => (
            <option key={entry.recruiterUserId} value={entry.recruiterUserId}>
              {entry.recruiterDisplayName}
            </option>
          ))}
        </Select>
      </div>
      <div className="reporting-filters__actions">
        <Button
          loading={busy}
          loadingLabel={t('common.status.working')}
          size="compact"
          type="submit"
        >
          {t('reporting.filters.apply')}
        </Button>
        <Button onClick={onReset} size="compact" variant="secondary">
          {t('reporting.filters.reset')}
        </Button>
      </div>
    </form>
  );
}
