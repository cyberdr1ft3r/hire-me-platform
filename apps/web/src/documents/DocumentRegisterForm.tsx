import type { DocumentContextOptionKind } from '@hire-me/contracts';
import type { FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, InlineMessage, Select, TextField } from '../ui/index.js';
import type { DocumentAccess } from './document-access.js';
import { CREATABLE_DOCUMENT_TYPES } from './document-labels.js';
import {
  attachTargetsFor,
  registerProblem,
  type AttachTarget,
  type PickerOption,
  type RegisterValues,
} from './document-state.js';
import { DocumentOptionPicker, type LoadDocumentOptions } from './DocumentOptionPicker.js';

/**
 * Guided registration: pick the type, then the one record the document belongs
 * to, by name. There is no free-text ID and no owner field; the server records
 * the actor as owner and re-checks every link.
 */
export function DocumentRegisterForm({
  access,
  loadOptions,
  onChange,
  onSubmit,
  sessionKey,
  values,
  writesLocked,
}: {
  access: DocumentAccess;
  loadOptions: (
    kind: DocumentContextOptionKind,
    purpose: 'attach',
    missionCandidateId?: string,
  ) => LoadDocumentOptions;
  onChange: (values: RegisterValues) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  sessionKey: number;
  values: RegisterValues;
  writesLocked: boolean;
}) {
  const { formatDateTime, t } = useI18n();
  const targets = attachTargetsFor(values.documentType, access);
  const problem = registerProblem(values, access);
  const typeConstraint =
    values.documentType === 'CONTRAT_RECRUTEMENT'
      ? t('documents.register.recruitmentContractNeedsMission')
      : values.documentType === 'CONTRAT_FORMATION'
        ? t('documents.register.trainingContractLimits')
        : undefined;

  function chooseTarget(target: AttachTarget): void {
    onChange({
      ...values,
      target,
      client: null,
      candidate: null,
      mission: null,
      process: null,
      interview: null,
    });
  }

  function interviewText(option: PickerOption): string {
    if (!option.interview) {
      return option.label;
    }
    return `${t(`documents.interviewType.${option.interview.interviewType}`)} · ${formatDateTime(
      option.interview.scheduledStartAt,
    )}`;
  }

  return (
    <form aria-labelledby="document-register-title" className="document-form" onSubmit={onSubmit}>
      <div className="document-form__grid">
        <TextField
          label={t('documents.register.titleField')}
          maxLength={180}
          name="title"
          onChange={(event) => onChange({ ...values, title: event.currentTarget.value })}
          required
          value={values.title}
        />
        <Select
          hint={typeConstraint}
          label={t('documents.register.type')}
          name="documentType"
          onChange={(event) => {
            const documentType =
              CREATABLE_DOCUMENT_TYPES.find((type) => type === event.currentTarget.value) ??
              values.documentType;
            const allowed = attachTargetsFor(documentType, access);
            const target = allowed.includes(values.target)
              ? values.target
              : (allowed[0] ?? 'UNLINKED');
            onChange({
              ...values,
              documentType,
              ...(target === values.target
                ? {}
                : {
                    target,
                    client: null,
                    candidate: null,
                    mission: null,
                    process: null,
                    interview: null,
                  }),
            });
          }}
          value={values.documentType}
        >
          {CREATABLE_DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`documents.types.${type}`)}
            </option>
          ))}
        </Select>
      </div>

      <fieldset className="document-form__fieldset">
        <legend>{t('documents.register.attachTo')}</legend>
        <p className="ui-field__hint">{t('documents.register.attachHint')}</p>
        <div className="document-form__targets">
          {targets.map((target) => (
            <label className="document-form__target" key={target}>
              <input
                checked={values.target === target}
                name="attachTarget"
                onChange={() => chooseTarget(target)}
                type="radio"
                value={target}
              />
              <span>{t(`documents.register.targets.${target}`)}</span>
            </label>
          ))}
        </div>

        {values.target === 'CLIENT' ? (
          <DocumentOptionPicker
            hint={t('documents.register.attachHint')}
            label={t('documents.context.client')}
            loadOptions={loadOptions('client', 'attach')}
            onChange={(client) => onChange({ ...values, client })}
            required
            sourceKey={`${sessionKey}:attach:client`}
            value={values.client}
          />
        ) : null}
        {values.target === 'CANDIDATE' ? (
          <DocumentOptionPicker
            hint={t('documents.register.attachHint')}
            label={t('documents.context.candidate')}
            loadOptions={loadOptions('candidate', 'attach')}
            onChange={(candidate) => onChange({ ...values, candidate })}
            required
            sourceKey={`${sessionKey}:attach:candidate`}
            value={values.candidate}
          />
        ) : null}
        {values.target === 'MISSION' ? (
          <DocumentOptionPicker
            hint={t('documents.register.attachHint')}
            label={t('documents.context.mission')}
            loadOptions={loadOptions('mission', 'attach')}
            onChange={(mission) => onChange({ ...values, mission })}
            required
            sourceKey={`${sessionKey}:attach:mission`}
            value={values.mission}
          />
        ) : null}
        {values.target === 'PROCESS' || values.target === 'INTERVIEW' ? (
          <DocumentOptionPicker
            hint={t('documents.register.processHint')}
            label={t('documents.register.process')}
            loadOptions={loadOptions('missionCandidate', 'attach')}
            onChange={(process) => onChange({ ...values, process, interview: null })}
            required
            sourceKey={`${sessionKey}:attach:process`}
            value={values.process}
          />
        ) : null}
        {values.target === 'INTERVIEW' && values.process ? (
          <DocumentOptionPicker
            formatOption={interviewText}
            hint={t('documents.register.attachHint')}
            label={t('documents.register.interview')}
            loadOptions={loadOptions('interview', 'attach', values.process.id)}
            onChange={(interview) => onChange({ ...values, interview })}
            required
            sourceKey={`${sessionKey}:attach:interview:${values.process.id}`}
            value={values.interview}
          />
        ) : null}
      </fieldset>

      <TextField
        accept=".pdf,.doc,.docx,.xlsx,.png,.jpg,.jpeg,.txt"
        hint={t('documents.register.fileHint')}
        label={t('documents.register.file')}
        name="versionFile"
        onChange={(event) => onChange({ ...values, file: event.currentTarget.files?.[0] ?? null })}
        type="file"
      />
      <p className="document-muted">{t('documents.register.ownerNote')}</p>
      {problem && problem !== 'documents.register.selectionRequired' ? (
        <InlineMessage title={t('documents.register.attachTo')} tone="warning">
          {t(problem)}
        </InlineMessage>
      ) : null}
      <div className="document-form__actions">
        <Button
          disabled={writesLocked || problem !== null || values.title.trim().length === 0}
          type="submit"
          variant="primary"
        >
          {t('documents.register.submit')}
        </Button>
      </div>
    </form>
  );
}
