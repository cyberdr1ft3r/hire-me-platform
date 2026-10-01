import type {
  InternalPublicApplicationSummary,
  InternalPublicOpportunity,
  InternalPublicOpportunityUpdateRequest,
  MissionSummary,
  PublicContentLanguage,
} from '@hire-me/contracts';
import { useState, type FormEvent } from 'react';

import { authoredContentLanguage, useI18n } from '../i18n/index.js';
import {
  Button,
  Checkbox,
  EmptyState,
  Select,
  StatusBadge,
  TextArea,
  TextField,
} from '../ui/index.js';
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
import type { PublicOpportunitySectionState, SectionState } from './mission-state.js';

export type PublicationChange = 'disableApplications' | 'enableApplications' | 'list' | 'unlist';

export interface MissionPublicOpportunityModel {
  /** The editor's unsaved language choice; it belongs to one opportunity or draft mission. */
  contentLanguageDraft: { opportunityId: string; value: PublicContentLanguage | null } | null;
  onContentLanguageChange: (opportunityId: string, value: PublicContentLanguage | null) => void;
  onCopyLink: (opportunity: InternalPublicOpportunity) => void;
  onPublication: (change: PublicationChange) => void;
  onRetry: () => void;
  onSave: (input: InternalPublicOpportunityUpdateRequest) => void;
  opportunity: PublicOpportunitySectionState;
}

export function publicOpportunityPath(opportunity: Pick<InternalPublicOpportunity, 'publicSlug'>) {
  return `/opportunities/${opportunity.publicSlug}`;
}

const DEFAULT_UPLOADS = {
  cvRequired: true,
  certificationsEnabled: true,
  certificationsRequired: false,
  diplomasEnabled: true,
  diplomasRequired: false,
  additionalAttachmentsEnabled: false,
} as const;

export function MissionPublicOpportunity({
  access,
  mission,
  model,
  writable,
  writesLocked,
}: {
  access: MissionAccess;
  mission: MissionSummary;
  model: MissionPublicOpportunityModel;
  writable: boolean;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const section = model.opportunity;

  if (section.status === 'idle') {
    return null;
  }

  return (
    <section aria-label={t('missions.publicOpportunity.region')} className="mission-section">
      <h3 className="mission-section__title">{t('missions.publicOpportunity.title')}</h3>
      {section.status === 'loading' || section.status === 'error' ? (
        <SectionStatus onRetry={model.onRetry} section={section}>
          {() => null}
        </SectionStatus>
      ) : null}
      {section.status === 'missing' ? (
        <MissingPublicOpportunity
          access={access}
          mission={mission}
          model={model}
          writable={writable}
          writesLocked={writesLocked}
        />
      ) : null}
      {section.status === 'ready' ? (
        <OpportunityDetail
          access={access}
          model={model}
          opportunity={section.data}
          writable={writable}
          writesLocked={writesLocked}
        />
      ) : null}
    </section>
  );
}

function MissingPublicOpportunity({
  access,
  mission,
  model,
  writable,
  writesLocked,
}: {
  access: MissionAccess;
  mission: MissionSummary;
  model: MissionPublicOpportunityModel;
  writable: boolean;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const canEdit = writable && access.canManagePublicOpportunity;

  return (
    <div className="mission-group">
      <EmptyState title={t('missions.publicOpportunity.empty.title')}>
        {t(
          canEdit
            ? 'missions.publicOpportunity.empty.body'
            : 'missions.publicOpportunity.empty.readOnlyBody',
        )}
      </EmptyState>
      {canEdit ? (
        <OpportunityEditor
          canEdit
          contentKey={mission.id}
          defaults={{
            applicationDeadline: mission.applicationDeadline,
            contentLanguage: null,
            publicationStartsAt: null,
            publicDescription: mission.description,
            publicEngagementType: mission.engagementType,
            publicExperienceLevel: null,
            publicLocation: mission.location,
            publicSkills: null,
            publicSummary: mission.description,
            publicTitle: mission.title,
            publicWorkArrangement: mission.workArrangement,
            showClientName: false,
            showSalary: false,
            uploadRequirements: { ...DEFAULT_UPLOADS },
          }}
          model={model}
          writesLocked={writesLocked}
        />
      ) : null}
    </div>
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
        contentKey={opportunity.id}
        defaults={{
          applicationDeadline: opportunity.applicationDeadline,
          contentLanguage: opportunity.contentLanguage,
          publicationStartsAt: opportunity.publicationStartsAt,
          publicDescription: opportunity.publicDescription,
          publicEngagementType: opportunity.publicEngagementType,
          publicExperienceLevel: opportunity.publicExperienceLevel,
          publicLocation: opportunity.publicLocation,
          publicSkills: opportunity.publicSkills,
          publicSummary: opportunity.publicSummary,
          publicTitle: opportunity.publicTitle,
          publicWorkArrangement: opportunity.publicWorkArrangement,
          showClientName: opportunity.showClientName,
          showSalary: opportunity.showSalary,
          uploadRequirements: opportunity.uploadRequirements,
        }}
        model={model}
        writesLocked={writesLocked}
      />
    </div>
  );
}

type EditorDefaults = {
  applicationDeadline: string | null;
  contentLanguage: PublicContentLanguage | null;
  publicationStartsAt: string | null;
  publicDescription: string | null;
  publicEngagementType: string | null;
  publicExperienceLevel: string | null;
  publicLocation: string | null;
  publicSkills: string | null;
  publicSummary: string | null;
  publicTitle: string;
  publicWorkArrangement: string | null;
  showClientName: boolean;
  showSalary: boolean;
  uploadRequirements: {
    additionalAttachmentsEnabled: boolean;
    certificationsEnabled: boolean;
    certificationsRequired: boolean;
    cvRequired: boolean;
    diplomasEnabled: boolean;
    diplomasRequired: boolean;
  };
};

/**
 * The staff editor for the public job text. Every authored input states the
 * selected content language (or `lang=""` when not specified), so assistive
 * and browser language tools never assume the interface language (D-070).
 */
function OpportunityEditor({
  canEdit,
  contentKey,
  defaults,
  model,
  writesLocked,
}: {
  canEdit: boolean;
  contentKey: string;
  defaults: EditorDefaults;
  model: MissionPublicOpportunityModel;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const uploads = defaults.uploadRequirements;
  const [certificationsEnabled, setCertificationsEnabled] = useState(uploads.certificationsEnabled);
  const [diplomasEnabled, setDiplomasEnabled] = useState(uploads.diplomasEnabled);
  const draft = model.contentLanguageDraft;
  const selectedLanguage =
    draft?.opportunityId === contentKey ? draft.value : defaults.contentLanguage;
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
      publicTitle: formValue(data, 'publicTitle', defaults.publicTitle).trim(),
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
          model.onContentLanguageChange(contentKey, contentLanguageValue(event.currentTarget.value))
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
          defaultValue={defaults.publicTitle}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.publicTitle')}
          maxLength={180}
          name="publicTitle"
          required
        />
        <TextField
          {...authored}
          defaultValue={defaults.publicLocation ?? ''}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.publicLocation')}
          maxLength={160}
          name="publicLocation"
        />
        <TextField
          {...authored}
          defaultValue={defaults.publicWorkArrangement ?? ''}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.publicWorkArrangement')}
          maxLength={120}
          name="publicWorkArrangement"
        />
        <TextField
          {...authored}
          defaultValue={defaults.publicEngagementType ?? ''}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.publicEngagementType')}
          maxLength={120}
          name="publicEngagementType"
        />
        <TextField
          {...authored}
          defaultValue={defaults.publicExperienceLevel ?? ''}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.publicExperienceLevel')}
          maxLength={120}
          name="publicExperienceLevel"
        />
      </div>
      <TextArea
        {...authored}
        defaultValue={defaults.publicSummary ?? ''}
        disabled={disabled}
        label={t('missions.publicOpportunity.editor.publicSummary')}
        maxLength={800}
        name="publicSummary"
        rows={3}
      />
      <TextArea
        {...authored}
        defaultValue={defaults.publicDescription ?? ''}
        disabled={disabled}
        label={t('missions.publicOpportunity.editor.publicDescription')}
        maxLength={4000}
        name="publicDescription"
        rows={6}
      />
      <TextArea
        {...authored}
        defaultValue={defaults.publicSkills ?? ''}
        disabled={disabled}
        label={t('missions.publicOpportunity.editor.publicSkills')}
        maxLength={1200}
        name="publicSkills"
        rows={3}
      />
      <div className="mission-form__grid">
        <TextField
          defaultValue={dateTimeInputValue(defaults.publicationStartsAt)}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.publicationStartsAt')}
          name="publicationStartsAt"
          type="datetime-local"
        />
        <TextField
          defaultValue={dateTimeInputValue(defaults.applicationDeadline)}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.applicationDeadline')}
          name="applicationDeadline"
          type="datetime-local"
        />
      </div>
      <fieldset className="mission-fieldset">
        <legend>{t('missions.publicOpportunity.editor.visibilityTitle')}</legend>
        <Checkbox
          defaultChecked={defaults.showClientName}
          disabled={disabled}
          label={t('missions.publicOpportunity.editor.showClientName')}
          name="showClientName"
        />
        <Checkbox
          defaultChecked={defaults.showSalary}
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
