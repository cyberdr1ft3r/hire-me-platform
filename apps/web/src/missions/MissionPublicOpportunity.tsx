import type {
  InternalPublicApplicationSummary,
  InternalPublicOpportunity,
  InternalPublicOpportunityUpdateRequest,
  PublicContentLanguage,
} from '@hire-me/contracts';
import { useState, type FormEvent } from 'react';

import { authoredContentLanguage, useI18n } from '../i18n/index.js';
import { Button, Checkbox, Select, StatusBadge, TextArea, TextField } from '../ui/index.js';
import { ScrollTable, SectionStatus } from './MissionBits.js';
import type { MissionAccess } from './mission-access.js';
import {
  contentLanguageValue,
  dateTimeInputValue,
  formValue,
  nullableFormValue,
  optionalDateTimeFormValue,
} from './mission-form.js';
import { publicStatusLabelKey, publicStatusTone } from './mission-labels.js';
import type { SectionState } from './mission-state.js';

export type PublicationChange = 'disableApplications' | 'enableApplications' | 'list' | 'unlist';

export interface MissionPublicOpportunityModel {
  /** The editor's unsaved language choice; it belongs to one opportunity. */
  contentLanguageDraft: { opportunityId: string; value: PublicContentLanguage | null } | null;
  onContentLanguageChange: (opportunityId: string, value: PublicContentLanguage | null) => void;
  onCopyLink: (opportunity: InternalPublicOpportunity) => void;
  onPublication: (change: PublicationChange) => void;
  onRetry: () => void;
  onSave: (input: InternalPublicOpportunityUpdateRequest) => void;
  opportunity: SectionState<InternalPublicOpportunity>;
}

export function publicOpportunityPath(opportunity: Pick<InternalPublicOpportunity, 'publicSlug'>) {
  return `/opportunities/${opportunity.publicSlug}`;
}

export function MissionPublicOpportunity({
  access,
  model,
  writable,
  writesLocked,
}: {
  access: MissionAccess;
  model: MissionPublicOpportunityModel;
  writable: boolean;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  return (
    <section aria-label={t('missions.publicOpportunity.region')} className="mission-section">
      <h3 className="mission-section__title">{t('missions.publicOpportunity.title')}</h3>
      <SectionStatus onRetry={model.onRetry} section={model.opportunity}>
        {(opportunity) => (
          <OpportunityDetail
            access={access}
            model={model}
            opportunity={opportunity}
            writable={writable}
            writesLocked={writesLocked}
          />
        )}
      </SectionStatus>
    </section>
  );
}

function OpportunityDetail({
  access,
  model,
  opportunity,
  writable,
  writesLocked,
}: {
  access: MissionAccess;
  model: MissionPublicOpportunityModel;
  opportunity: InternalPublicOpportunity;
  writable: boolean;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const path = publicOpportunityPath(opportunity);
  const publish = writable && access.canPublishPublicOpportunity;

  return (
    <div className="mission-group">
      <p className="mission-badges">
        <StatusBadge tone={publicStatusTone(opportunity.status)}>
          {t(publicStatusLabelKey(opportunity.status))}
        </StatusBadge>
        <StatusBadge tone={opportunity.applicationLinkEnabled ? 'success' : 'neutral'}>
          {opportunity.applicationLinkEnabled
            ? t('missions.publicOpportunity.applicationsOpen')
            : t('missions.publicOpportunity.applicationsClosed')}
        </StatusBadge>
        <StatusBadge tone={opportunity.listedOnWebsite ? 'success' : 'neutral'}>
          {opportunity.listedOnWebsite
            ? t('missions.publicOpportunity.listed')
            : t('missions.publicOpportunity.unlisted')}
        </StatusBadge>
      </p>
      <dl className="mission-summary">
        <div className="mission-summary__item mission-summary__item--wide">
          <dt>{t('missions.publicOpportunity.link')}</dt>
          <dd className="mission-break">
            <a href={path}>{`${window.location.origin}${path}`}</a>
          </dd>
        </div>
      </dl>
      <div className="mission-actions">
        <a
          className="ui-button ui-button--secondary ui-button--compact"
          href={path}
          rel="noreferrer"
          target="_blank"
        >
          {t('missions.publicOpportunity.actions.openPreview')}
        </a>
        <Button onClick={() => model.onCopyLink(opportunity)} size="compact" variant="secondary">
          {t('missions.publicOpportunity.actions.copyLink')}
        </Button>
      </div>
      {publish ? (
        <div className="mission-group">
          <h4 className="mission-subtitle">{t('missions.publicOpportunity.publicationTitle')}</h4>
          <div className="mission-actions">
            {opportunity.applicationLinkEnabled && opportunity.status === 'OPEN' ? (
              <Button
                disabled={writesLocked}
                onClick={() => model.onPublication('disableApplications')}
                size="compact"
                variant="secondary"
              >
                {t('missions.publicOpportunity.actions.disableApplications')}
              </Button>
            ) : (
              <Button
                disabled={writesLocked}
                onClick={() => model.onPublication('enableApplications')}
                size="compact"
                variant="secondary"
              >
                {t('missions.publicOpportunity.actions.enableApplications')}
              </Button>
            )}
            {opportunity.listedOnWebsite ? (
              <Button
                disabled={writesLocked}
                onClick={() => model.onPublication('unlist')}
                size="compact"
                variant="secondary"
              >
                {t('missions.publicOpportunity.actions.unlist')}
              </Button>
            ) : (
              <Button
                disabled={writesLocked}
                onClick={() => model.onPublication('list')}
                size="compact"
                variant="secondary"
              >
                {t('missions.publicOpportunity.actions.list')}
              </Button>
            )}
          </div>
        </div>
      ) : null}
      <OpportunityEditor
        canEdit={writable && access.canManagePublicOpportunity}
        model={model}
        opportunity={opportunity}
        writesLocked={writesLocked}
      />
    </div>
  );
}

/**
 * The staff editor for the public job text. Every authored input states the
 * selected content language (or `lang=""` when not specified), so assistive
 * and browser language tools never assume the interface language (D-070).
 */
function OpportunityEditor({
  canEdit,
  model,
  opportunity,
  writesLocked,
}: {
  canEdit: boolean;
  model: MissionPublicOpportunityModel;
  opportunity: InternalPublicOpportunity;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const uploads = opportunity.uploadRequirements;
  const [certificationsEnabled, setCertificationsEnabled] = useState(uploads.certificationsEnabled);
  const [diplomasEnabled, setDiplomasEnabled] = useState(uploads.diplomasEnabled);
  const draft = model.contentLanguageDraft;
  const selectedLanguage =
    draft?.opportunityId === opportunity.id ? draft.value : opportunity.contentLanguage;
  const authored = authoredContentLanguage(selectedLanguage);
  const disabled = !canEdit;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canEdit) {
      return;
    }
    const data = new FormData(event.currentTarget);
    const checked = (name: string) => data.get(name) === 'on';
    model.onSave({
      publicTitle: formValue(data, 'publicTitle', opportunity.publicTitle).trim(),
      publicSummary: nullableFormValue(data, 'publicSummary'),
      publicDescription: nullableFormValue(data, 'publicDescription'),
      publicLocation: nullableFormValue(data, 'publicLocation'),
      publicWorkArrangement: nullableFormValue(data, 'publicWorkArrangement'),
      publicEngagementType: nullableFormValue(data, 'publicEngagementType'),
      publicExperienceLevel: nullableFormValue(data, 'publicExperienceLevel'),
      publicSkills: nullableFormValue(data, 'publicSkills'),
      contentLanguage: contentLanguageValue(data.get('contentLanguage')),
      publicationStartsAt: optionalDateTimeFormValue(data, 'publicationStartsAt') ?? null,
      applicationDeadline: optionalDateTimeFormValue(data, 'applicationDeadline') ?? null,
      showClientName: checked('showClientName'),
      showSalary: checked('showSalary'),
      cvRequired: checked('cvRequired'),
      certificationsEnabled: checked('certificationsEnabled'),
      certificationsRequired: checked('certificationsEnabled') && checked('certificationsRequired'),
      diplomasEnabled: checked('diplomasEnabled'),
      diplomasRequired: checked('diplomasEnabled') && checked('diplomasRequired'),
      additionalAttachmentsEnabled: checked('additionalAttachmentsEnabled'),
    });
  }

  return (
    <form
      aria-label={t('missions.publicOpportunity.editor.region')}
      className="mission-form"
      onSubmit={handleSubmit}
    >
      <h4 className="mission-subtitle">{t('missions.publicOpportunity.editor.region')}</h4>
      <Select
        disabled={disabled}
        hint={t('missions.publicOpportunity.editor.contentLanguageHelp')}
        label={t('missions.publicOpportunity.editor.contentLanguage')}
        name="contentLanguage"
        onChange={(event) =>
          model.onContentLanguageChange(
            opportunity.id,
            contentLanguageValue(event.currentTarget.value),
          )
        }
        value={selectedLanguage ?? ''}
      >
        <option value="">{t('missions.publicOpportunity.languages.unspecified')}</option>
        <option value="en">{t('missions.publicOpportunity.languages.en')}</option>
        <option value="fr">{t('missions.publicOpportunity.languages.fr')}</option>
      </Select>
      <div className="mission-form__grid">
        <TextField
          {...authored}
          defaultValue={opportunity.publicTitle}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.publicTitle')}
          maxLength={180}
          name="publicTitle"
          required
        />
        <TextField
          {...authored}
          defaultValue={opportunity.publicLocation ?? ''}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.publicLocation')}
          maxLength={160}
          name="publicLocation"
        />
        <TextField
          {...authored}
          defaultValue={opportunity.publicWorkArrangement ?? ''}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.publicWorkArrangement')}
          maxLength={120}
          name="publicWorkArrangement"
        />
        <TextField
          {...authored}
          defaultValue={opportunity.publicEngagementType ?? ''}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.publicEngagementType')}
          maxLength={120}
          name="publicEngagementType"
        />
        <TextField
          {...authored}
          defaultValue={opportunity.publicExperienceLevel ?? ''}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.publicExperienceLevel')}
          maxLength={120}
          name="publicExperienceLevel"
        />
      </div>
      <TextArea
        {...authored}
        defaultValue={opportunity.publicSummary ?? ''}
        disabled={disabled}
        label={t('missions.publicOpportunity.editor.publicSummary')}
        maxLength={800}
        name="publicSummary"
        rows={3}
      />
      <TextArea
        {...authored}
        defaultValue={opportunity.publicDescription ?? ''}
        disabled={disabled}
        label={t('missions.publicOpportunity.editor.publicDescription')}
        maxLength={4000}
        name="publicDescription"
        rows={6}
      />
      <TextArea
        {...authored}
        defaultValue={opportunity.publicSkills ?? ''}
        disabled={disabled}
        label={t('missions.publicOpportunity.editor.publicSkills')}
        maxLength={1200}
        name="publicSkills"
        rows={3}
      />
      <div className="mission-form__grid">
        <TextField
          defaultValue={dateTimeInputValue(opportunity.publicationStartsAt)}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.publicationStartsAt')}
          name="publicationStartsAt"
          type="datetime-local"
        />
        <TextField
          defaultValue={dateTimeInputValue(opportunity.applicationDeadline)}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.applicationDeadline')}
          name="applicationDeadline"
          type="datetime-local"
        />
      </div>
      <fieldset className="mission-fieldset">
        <legend>{t('missions.publicOpportunity.editor.visibilityTitle')}</legend>
        <Checkbox
          defaultChecked={opportunity.showClientName}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.showClientName')}
          name="showClientName"
        />
        <Checkbox
          defaultChecked={opportunity.showSalary}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.showSalary')}
          name="showSalary"
        />
      </fieldset>
      <fieldset className="mission-fieldset">
        <legend>{t('missions.publicOpportunity.editor.uploadsTitle')}</legend>
        <Checkbox
          defaultChecked={uploads.cvRequired}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.cvRequired')}
          name="cvRequired"
        />
        <Checkbox
          checked={certificationsEnabled}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.certificationsEnabled')}
          name="certificationsEnabled"
          onChange={(event) => setCertificationsEnabled(event.currentTarget.checked)}
        />
        <Checkbox
          defaultChecked={uploads.certificationsRequired}
          disabled={disabled || !certificationsEnabled}
          label={t('missions.publicOpportunity.editor.certificationsRequired')}
          name="certificationsRequired"
        />
        <Checkbox
          checked={diplomasEnabled}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.diplomasEnabled')}
          name="diplomasEnabled"
          onChange={(event) => setDiplomasEnabled(event.currentTarget.checked)}
        />
        <Checkbox
          defaultChecked={uploads.diplomasRequired}
          disabled={disabled || !diplomasEnabled}
          label={t('missions.publicOpportunity.editor.diplomasRequired')}
          name="diplomasRequired"
        />
        <Checkbox
          defaultChecked={uploads.additionalAttachmentsEnabled}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.additionalAttachmentsEnabled')}
          name="additionalAttachmentsEnabled"
        />
      </fieldset>
      {canEdit ? (
        <div className="mission-actions">
          <Button disabled={writesLocked} type="submit" variant="primary">
            {t('missions.publicOpportunity.editor.save')}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

export function MissionPublicApplications({
  applications,
  onRetry,
}: {
  applications: SectionState<InternalPublicApplicationSummary[]>;
  onRetry: () => void;
}) {
  const { formatDateTime, t } = useI18n();
  const title = t('missions.applications.title');
  return (
    <section aria-label={t('missions.applications.region')} className="mission-section">
      <h3 className="mission-section__title">{title}</h3>
      <SectionStatus onRetry={onRetry} section={applications}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="mission-muted">{t('missions.applications.empty')}</p>
          ) : (
            <ScrollTable label={title}>
              <table className="mission-table">
                <thead>
                  <tr>
                    <th scope="col">{t('missions.applications.columns.name')}</th>
                    <th scope="col">{t('missions.applications.columns.email')}</th>
                    <th scope="col">{t('missions.applications.columns.location')}</th>
                    <th scope="col">{t('missions.applications.columns.files')}</th>
                    <th scope="col">{t('missions.applications.columns.submittedAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((application) => (
                    <tr key={application.id}>
                      <th scope="row">{application.submittedFullName}</th>
                      <td className="mission-break">{application.submittedEmail}</td>
                      <td>
                        {[application.submittedCity, application.submittedCountry]
                          .filter(Boolean)
                          .join(', ') || (
                          <span className="mission-muted">{t('missions.notRecorded')}</span>
                        )}
                      </td>
                      <td className="u-tabular">
                        {t('missions.applications.files', { count: application.fileCount })}
                      </td>
                      <td className="u-tabular">{formatDateTime(application.submittedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          )
        }
      </SectionStatus>
    </section>
  );
}
