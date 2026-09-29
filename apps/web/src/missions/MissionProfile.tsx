import type { MissionSummary } from '@hire-me/contracts';
import type { FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select, TextField } from '../ui/index.js';
import { SummaryItem } from './MissionBits.js';
import {
  MISSION_PRIORITIES,
  closureReasonLabelKey,
  missionPriorityLabelKey,
} from './mission-labels.js';
import type { MissionProfileValues } from './mission-state.js';

export interface MissionProfileModel {
  editValues: MissionProfileValues | null;
  onEditValuesChange: (values: MissionProfileValues) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}

function formatCents(
  cents: number,
  currency: string | null,
  formatCurrency: (value: number, currency: string) => string,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
): string {
  const amount = cents / 100;
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    return formatCurrency(amount, currency);
  }
  return formatNumber(amount, { maximumFractionDigits: 2 });
}

export function MissionProfile({
  canEdit,
  mission,
  model,
  writesLocked,
}: {
  canEdit: boolean;
  mission: MissionSummary;
  model: MissionProfileModel;
  writesLocked: boolean;
}) {
  const { formatCurrency, formatDate, formatDateTime, formatNumber, t } = useI18n();
  const commercial = mission.commercial;
  const salaryParts = commercial
    ? [commercial.salaryMinCents, commercial.salaryMaxCents]
        .filter((value): value is number => value !== null)
        .map((value) => formatCents(value, commercial.salaryCurrency, formatCurrency, formatNumber))
    : [];

  return (
    <section aria-labelledby="mission-profile-title" className="mission-section">
      <h3 className="mission-section__title" id="mission-profile-title">
        {t('missions.profile.title')}
      </h3>
      <dl className="mission-summary">
        <SummaryItem label={t('missions.profile.fields.client')}>{mission.clientName}</SummaryItem>
        <SummaryItem label={t('missions.profile.fields.priority')}>
          {t(missionPriorityLabelKey(mission.priority))}
        </SummaryItem>
        <SummaryItem label={t('missions.profile.fields.positions')}>
          <span className="u-tabular">
            {t('missions.profile.positionsValue', {
              filled: formatNumber(mission.filledPlacementCount),
              total: formatNumber(mission.numberOfPositions),
            })}
          </span>
        </SummaryItem>
        <SummaryItem label={t('missions.profile.fields.location')}>{mission.location}</SummaryItem>
        <SummaryItem label={t('missions.profile.fields.workArrangement')}>
          {mission.workArrangement}
        </SummaryItem>
        <SummaryItem label={t('missions.profile.fields.engagementType')}>
          {mission.engagementType}
        </SummaryItem>
        <SummaryItem label={t('missions.profile.fields.targetStartDate')}>
          {mission.targetStartDate ? formatDate(mission.targetStartDate) : null}
        </SummaryItem>
        <SummaryItem label={t('missions.profile.fields.applicationDeadline')}>
          {mission.applicationDeadline ? formatDateTime(mission.applicationDeadline) : null}
        </SummaryItem>
        {mission.closureReason ? (
          <SummaryItem label={t('missions.profile.fields.closureReason')}>
            {t(closureReasonLabelKey(mission.closureReason))}
          </SummaryItem>
        ) : null}
        {mission.closedAt ? (
          <SummaryItem label={t('missions.profile.fields.closedAt')}>
            {formatDateTime(mission.closedAt)}
          </SummaryItem>
        ) : null}
      </dl>
      {mission.description ? (
        <div className="mission-prose">
          <h4 className="mission-subtitle">{t('missions.profile.fields.description')}</h4>
          <p>{mission.description}</p>
        </div>
      ) : null}
      {mission.requirements ? (
        <div className="mission-prose">
          <h4 className="mission-subtitle">{t('missions.profile.fields.requirements')}</h4>
          <p>{mission.requirements}</p>
        </div>
      ) : null}
      {commercial ? (
        <div className="mission-prose">
          <h4 className="mission-subtitle">{t('missions.profile.commercial.title')}</h4>
          <dl className="mission-summary">
            <SummaryItem label={t('missions.profile.commercial.salaryRange')}>
              {salaryParts.length > 0 ? salaryParts.join(' – ') : null}
            </SummaryItem>
            <SummaryItem label={t('missions.profile.commercial.summary')}>
              {commercial.commercialSummary}
            </SummaryItem>
          </dl>
        </div>
      ) : null}

      {canEdit && model.editValues ? (
        <form
          aria-label={t('missions.profile.editTitle')}
          className="mission-form"
          onSubmit={model.onSave}
        >
          <h4 className="mission-subtitle">{t('missions.profile.editTitle')}</h4>
          <MissionProfileFields onChange={model.onEditValuesChange} values={model.editValues} />
          <div className="mission-actions">
            <Button disabled={writesLocked} type="submit" variant="primary">
              {t('missions.profile.save')}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

export function MissionProfileFields<Values extends MissionProfileValues>({
  onChange,
  values,
}: {
  onChange: (values: Values) => void;
  values: Values;
}) {
  const { t } = useI18n();
  return (
    <div className="mission-form__grid">
      <TextField
        label={t('missions.profile.fields.title')}
        maxLength={180}
        name="title"
        onChange={(event) => onChange({ ...values, title: event.currentTarget.value })}
        required
        value={values.title}
      />
      <Select
        label={t('missions.profile.fields.priority')}
        name="priority"
        onChange={(event) =>
          onChange({
            ...values,
            priority:
              MISSION_PRIORITIES.find((priority) => priority === event.currentTarget.value) ??
              values.priority,
          })
        }
        value={values.priority}
      >
        {MISSION_PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {t(missionPriorityLabelKey(priority))}
          </option>
        ))}
      </Select>
      <TextField
        inputMode="numeric"
        label={t('missions.profile.fields.positions')}
        min={1}
        name="numberOfPositions"
        onChange={(event) => onChange({ ...values, numberOfPositions: event.currentTarget.value })}
        required
        type="number"
        value={values.numberOfPositions}
      />
      <TextField
        label={t('missions.profile.fields.location')}
        maxLength={180}
        name="location"
        onChange={(event) => onChange({ ...values, location: event.currentTarget.value })}
        value={values.location}
      />
      <TextField
        label={t('missions.profile.fields.workArrangement')}
        maxLength={120}
        name="workArrangement"
        onChange={(event) => onChange({ ...values, workArrangement: event.currentTarget.value })}
        value={values.workArrangement}
      />
      <TextField
        label={t('missions.profile.fields.engagementType')}
        maxLength={120}
        name="engagementType"
        onChange={(event) => onChange({ ...values, engagementType: event.currentTarget.value })}
        value={values.engagementType}
      />
    </div>
  );
}
