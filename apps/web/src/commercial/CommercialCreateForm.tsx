import type { CommercialContractBusinessType } from '@hire-me/contracts';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Button, Checkbox, InlineMessage, Select, TextArea, TextField } from '../ui/index.js';
import type { CommercialAccess } from './commercial-access.js';
import { useCommercialFormat, type CommercialFormat } from './commercial-labels.js';
import {
  deriveContext,
  emptyLine,
  invoiceHasLineSource,
  SOURCE_FIELDS,
  toCreateRequest,
  type CommercialPickerOption,
  type CreateFormValues,
  type CreateRequest,
  type FormErrors,
  type LineValues,
  type SourceField,
} from './commercial-state.js';
import { CommercialOptionPicker } from './CommercialOptionPicker.js';
import type { CreateDraft } from './CommercialPanel.js';
import type { CommercialLoaders } from './CommercialWorkspace.js';

const MAX_LINES = 100;

export function CommercialCreateForm({
  access,
  draft,
  loaders,
  onCancel,
  onChange,
  onSubmit,
  sessionKey,
  writesLocked,
}: {
  access: CommercialAccess;
  draft: CreateDraft;
  loaders: CommercialLoaders;
  onCancel: () => void;
  onChange: (values: CreateFormValues) => void;
  onSubmit: (request: CreateRequest) => Promise<boolean>;
  sessionKey: number;
  writesLocked: boolean;
}) {
  const format = useCommercialFormat();
  const { message, t } = format;
  const heading = useRef<HTMLHeadingElement>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const { kind, values } = draft;
  const clientId = values.client?.id ?? null;
  const derived = deriveContext(kind, values);
  const trainingContract = kind === 'contract' && values.businessType === 'TRAINING';

  useEffect(() => {
    heading.current?.focus();
  }, []);

  function update(next: Partial<CreateFormValues>): void {
    onChange({ ...values, ...next });
  }

  function chooseClient(client: CommercialPickerOption | null): void {
    // Every linked source and mission is scoped to one client.
    update({
      client,
      contract: null,
      mission: null,
      placement: null,
      purchaseOrder: null,
      quotation: null,
    });
  }

  function chooseSource(field: SourceField, option: CommercialPickerOption | null): void {
    update({ [field]: option, mission: null });
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = toCreateRequest(kind, values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    void onSubmit(result.value);
  }

  const error = (key: string) => {
    const messageKey = errors[key];
    return messageKey ? t(messageKey) : undefined;
  };
  const hasErrors = Object.keys(errors).length > 0;
  const showLines =
    kind === 'quotation' ||
    (kind === 'invoice' && !(invoiceHasLineSource(values) && values.useSourceLines));
  const pickableSources = SOURCE_FIELDS[kind].filter((field) =>
    field === 'placement' ? access.pickPlacements : access.view[field],
  );
  const missionForPlacements =
    derived.status === 'derived' ? derived.recruitmentMissionId : (values.mission?.id ?? null);

  return (
    <section aria-labelledby="commercial-create-title" className="commercial-create">
      <h2
        className="commercial__pane-title"
        id="commercial-create-title"
        ref={heading}
        tabIndex={-1}
      >
        {t(`commercial.form.title.${kind}`)}
      </h2>
      <form
        aria-labelledby="commercial-create-title"
        className="commercial-form"
        noValidate
        onSubmit={submit}
      >
        {hasErrors ? (
          <InlineMessage announce title={t('commercial.form.errorSummaryTitle')} tone="danger">
            <p className="commercial-message__text">{t('commercial.form.errorSummary')}</p>
          </InlineMessage>
        ) : null}

        <fieldset className="commercial-fieldset">
          <legend>{t('commercial.form.sections.identity')}</legend>
          <div className="commercial-form__grid">
            <TextField
              autoComplete="off"
              error={error('reference')}
              hint={t('commercial.form.referenceHint')}
              label={t('commercial.form.reference')}
              maxLength={80}
              onChange={(event) => update({ reference: event.currentTarget.value })}
              required
              value={values.reference}
            />
            {kind === 'contract' ? (
              <Select
                label={t('commercial.form.businessType')}
                onChange={(event) => {
                  const businessType = event.currentTarget.value as CommercialContractBusinessType;
                  update({
                    businessType,
                    ...(businessType === 'TRAINING' ? { mission: null } : {}),
                  });
                }}
                value={values.businessType}
              >
                <option value="RECRUITMENT">{t('commercial.businessType.RECRUITMENT')}</option>
                <option value="TRAINING">{t('commercial.businessType.TRAINING')}</option>
              </Select>
            ) : null}
          </div>
          {access.pickClients ? (
            <CommercialOptionPicker
              error={error('client')}
              hint={t('commercial.form.clientHint')}
              label={t('commercial.form.client')}
              loadOptions={loaders.clients}
              onChange={chooseClient}
              required
              sourceKey={`${sessionKey}:create-clients`}
              value={values.client}
            />
          ) : (
            <InlineMessage title={t('commercial.form.noClientSourceTitle')} tone="warning">
              <p className="commercial-message__text">{t('commercial.form.noClientSource')}</p>
            </InlineMessage>
          )}
        </fieldset>

        {pickableSources.length > 0 || access.pickMissions ? (
          <fieldset className="commercial-fieldset">
            <legend>{t('commercial.form.sections.links')}</legend>
            {!clientId ? (
              <p className="commercial-muted">{t('commercial.form.chooseClientFirst')}</p>
            ) : (
              <>
                {pickableSources.map((field) => (
                  <CommercialOptionPicker
                    emptyLabel={t(`commercial.form.noSource.${field}`)}
                    formatOption={field === 'placement' ? placementText(format) : undefined}
                    hint={t(`commercial.form.sourceHints.${field}`)}
                    key={field}
                    label={t(`commercial.form.sources.${field}`)}
                    loadOptions={
                      field === 'placement'
                        ? loaders.placements(clientId, missionForPlacements)
                        : loaders.sources(field, clientId)
                    }
                    onChange={(option) => chooseSource(field, option)}
                    sourceKey={`${sessionKey}:${kind}:${field}:${clientId}${
                      field === 'placement' ? `:${missionForPlacements ?? ''}` : ''
                    }`}
                    value={values[field]}
                  />
                ))}
                {derived.status === 'conflict' || errors.context ? (
                  <p className="ui-field__error" role="alert">
                    {message(errors.context ?? 'commercial.form.errors.context')}
                  </p>
                ) : null}
                {derived.status === 'derived' ? (
                  <dl className="commercial-facts">
                    <div>
                      <dt>{t('commercial.form.mission')}</dt>
                      <dd>
                        {derived.missionTitle ?? (
                          <span className="commercial-muted">{t('commercial.form.noMission')}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('commercial.form.derivedFrom')}</dt>
                      <dd>{t(`commercial.form.sources.${derived.from}`)}</dd>
                    </div>
                  </dl>
                ) : access.pickMissions && !trainingContract ? (
                  <CommercialOptionPicker
                    emptyLabel={t('commercial.form.noMission')}
                    hint={
                      access.missionsAssignedOnly
                        ? t('commercial.form.missionAssignedHint')
                        : t('commercial.form.missionHint')
                    }
                    label={t('commercial.form.mission')}
                    loadOptions={loaders.missions(clientId)}
                    onChange={(mission) => update({ mission })}
                    sourceKey={`${sessionKey}:${kind}:missions:${clientId}`}
                    value={values.mission}
                  />
                ) : null}
              </>
            )}
          </fieldset>
        ) : null}

        <fieldset className="commercial-fieldset">
          <legend>{t('commercial.form.sections.terms')}</legend>
          <div className="commercial-form__grid">
            {derived.status === 'derived' && derived.currency ? (
              <dl className="commercial-facts">
                <div>
                  <dt>{t('commercial.form.currency')}</dt>
                  <dd>{derived.currency}</dd>
                </div>
              </dl>
            ) : (
              <TextField
                autoComplete="off"
                error={error('currency')}
                hint={t('commercial.form.currencyHint')}
                label={t('commercial.form.currency')}
                maxLength={3}
                onChange={(event) => update({ currency: event.currentTarget.value.toUpperCase() })}
                required
                value={values.currency}
              />
            )}
            {kind === 'contract' || kind === 'purchaseOrder' ? (
              <>
                <TextField
                  error={error('amount')}
                  hint={t('commercial.form.amountHint')}
                  inputMode="decimal"
                  label={
                    kind === 'contract'
                      ? t('commercial.form.contractValue')
                      : t('commercial.form.amount')
                  }
                  onChange={(event) => update({ amount: event.currentTarget.value })}
                  required
                  value={values.amount}
                />
                <TextField
                  error={error('tax')}
                  hint={t('commercial.form.amountHint')}
                  inputMode="decimal"
                  label={t('commercial.form.tax')}
                  onChange={(event) => update({ tax: event.currentTarget.value })}
                  value={values.tax}
                />
              </>
            ) : null}
            {kind === 'quotation' || kind === 'purchaseOrder' || kind === 'invoice' ? (
              <DateField
                label={t('commercial.form.issueDate')}
                onChange={(issueDate) => update({ issueDate })}
                value={values.issueDate}
              />
            ) : null}
            {kind === 'quotation' ? (
              <DateField
                label={t('commercial.form.validUntil')}
                onChange={(validUntil) => update({ validUntil })}
                value={values.validUntil}
              />
            ) : null}
            {kind === 'purchaseOrder' ? (
              <DateField
                label={t('commercial.form.receivedDate')}
                onChange={(receivedDate) => update({ receivedDate })}
                value={values.receivedDate}
              />
            ) : null}
            {kind === 'invoice' ? (
              <DateField
                label={t('commercial.form.dueDate')}
                onChange={(dueDate) => update({ dueDate })}
                value={values.dueDate}
              />
            ) : null}
            {kind === 'contract' ? (
              <>
                <DateField
                  label={t('commercial.form.effectiveDate')}
                  onChange={(effectiveDate) => update({ effectiveDate })}
                  value={values.effectiveDate}
                />
                <DateField
                  label={t('commercial.form.startDate')}
                  onChange={(startDate) => update({ startDate })}
                  value={values.startDate}
                />
                <DateField
                  label={t('commercial.form.endDate')}
                  onChange={(endDate) => update({ endDate })}
                  value={values.endDate}
                />
              </>
            ) : null}
          </div>
          {kind === 'contract' ? (
            <TextArea
              hint={t('commercial.form.termsHint')}
              label={t('commercial.form.terms')}
              maxLength={2000}
              onChange={(event) => update({ termsSummary: event.currentTarget.value })}
              rows={3}
              value={values.termsSummary}
            />
          ) : null}
        </fieldset>

        {kind === 'invoice' && invoiceHasLineSource(values) ? (
          <Checkbox
            checked={values.useSourceLines}
            hint={t('commercial.form.useSourceLinesHint')}
            label={t('commercial.form.useSourceLines')}
            onChange={(event) => update({ useSourceLines: event.currentTarget.checked })}
          />
        ) : null}

        {showLines ? (
          <LineEditor
            error={error}
            format={format}
            lines={values.lines}
            onChange={(lines) => update({ lines })}
          />
        ) : null}

        <div className="commercial-actions">
          <Button
            disabled={writesLocked || !access.pickClients}
            loading={writesLocked}
            loadingLabel={t('common.status.working')}
            type="submit"
          >
            {t(`commercial.form.submit.${kind}`)}
          </Button>
          <Button onClick={onCancel} variant="quiet">
            {t('common.actions.cancel')}
          </Button>
        </div>
      </form>
    </section>
  );
}

function placementText(format: CommercialFormat) {
  return (option: CommercialPickerOption) =>
    option.placement
      ? format.t('commercial.form.placementOption', {
          confirmed: format.formatDate(option.placement.confirmedAt),
          mission: option.label,
          start: format.formatDate(option.placement.integrationStartDate),
        })
      : option.label;
}

function DateField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <TextField
      label={label}
      onChange={(event) => onChange(event.currentTarget.value)}
      type="date"
      value={value}
    />
  );
}

function LineEditor({
  error,
  format,
  lines,
  onChange,
}: {
  error: (key: string) => string | undefined;
  format: CommercialFormat;
  lines: LineValues[];
  onChange: (lines: LineValues[]) => void;
}) {
  const { t } = format;

  function change(key: number, next: Partial<LineValues>): void {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...next } : line)));
  }

  return (
    <fieldset className="commercial-fieldset">
      <legend>{t('commercial.form.lines.title')}</legend>
      {error('lines') ? (
        <p className="ui-field__error" role="alert">
          {error('lines')}
        </p>
      ) : null}
      <ol className="commercial-lines">
        {lines.map((line, index) => (
          <li className="commercial-lines__item" key={line.key}>
            <fieldset className="commercial-line">
              <legend>{t('commercial.form.lines.line', { number: index + 1 })}</legend>
              <div className="commercial-line__fields">
                <TextField
                  error={error(`line-${line.key}-description`)}
                  label={t('commercial.form.lines.description')}
                  maxLength={400}
                  onChange={(event) => change(line.key, { description: event.currentTarget.value })}
                  required
                  value={line.description}
                />
                <TextField
                  error={error(`line-${line.key}-quantity`)}
                  inputMode="numeric"
                  label={t('commercial.form.lines.quantity')}
                  onChange={(event) => change(line.key, { quantity: event.currentTarget.value })}
                  required
                  value={line.quantity}
                />
                <TextField
                  error={error(`line-${line.key}-unitPrice`)}
                  hint={t('commercial.form.amountHint')}
                  inputMode="decimal"
                  label={t('commercial.form.lines.unitPrice')}
                  onChange={(event) => change(line.key, { unitPrice: event.currentTarget.value })}
                  required
                  value={line.unitPrice}
                />
                <TextField
                  error={error(`line-${line.key}-taxRate`)}
                  hint={t('commercial.form.lines.taxRateHint')}
                  inputMode="decimal"
                  label={t('commercial.form.lines.taxRate')}
                  onChange={(event) => change(line.key, { taxRate: event.currentTarget.value })}
                  value={line.taxRate}
                />
              </div>
              {lines.length > 1 ? (
                <Button
                  onClick={() => onChange(lines.filter((item) => item.key !== line.key))}
                  size="compact"
                  variant="quiet"
                >
                  {t('commercial.form.lines.remove', { number: index + 1 })}
                </Button>
              ) : null}
            </fieldset>
          </li>
        ))}
      </ol>
      {lines.length < MAX_LINES ? (
        <Button
          onClick={() => onChange([...lines, emptyLine()])}
          size="compact"
          variant="secondary"
        >
          {t('commercial.form.lines.add')}
        </Button>
      ) : null}
    </fieldset>
  );
}
