import type { DocumentContextOptionKind } from '@hire-me/contracts';
import type { FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Select, TextField } from '../ui/index.js';
import type { DocumentAccess } from './document-access.js';
import { DOCUMENT_SOURCES, DOCUMENT_STATUSES, FILTER_DOCUMENT_TYPES } from './document-labels.js';
import type { DocumentFilterValues, DocumentLifecycleFilter } from './document-state.js';
import { DocumentOptionPicker, type LoadDocumentOptions } from './DocumentOptionPicker.js';

const LIFECYCLES: readonly DocumentLifecycleFilter[] = ['current', 'archived', 'all'];

export function DocumentFilters({
  access,
  busy,
  loadOptions,
  onChange,
  onReset,
  onSubmit,
  sessionKey,
  showReset,
  values,
}: {
  access: DocumentAccess;
  busy: boolean;
  loadOptions: (kind: DocumentContextOptionKind) => LoadDocumentOptions;
  onChange: (values: DocumentFilterValues) => void;
  onReset: () => void;
  onSubmit: () => void;
  sessionKey: number;
  showReset: boolean;
  values: DocumentFilterValues;
}) {
  const { t } = useI18n();

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      aria-label={t('documents.filters.region')}
      className="document-filters"
      onSubmit={handleSubmit}
      role="search"
    >
      <div className="document-filters__controls">
        <TextField
          autoComplete="off"
          hint={t('documents.filters.searchHint')}
          label={t('documents.filters.search')}
          maxLength={120}
          name="search"
          onChange={(event) => onChange({ ...values, search: event.currentTarget.value })}
          type="search"
          value={values.search}
        />
        <Select
          label={t('documents.filters.type')}
          name="documentType"
          onChange={(event) =>
            onChange({
              ...values,
              documentType:
                FILTER_DOCUMENT_TYPES.find((type) => type === event.currentTarget.value) ?? '',
            })
          }
          value={values.documentType}
        >
          <option value="">{t('documents.filters.anyType')}</option>
          {FILTER_DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`documents.types.${type}`)}
            </option>
          ))}
        </Select>
        <Select
          label={t('documents.filters.status')}
          name="status"
          onChange={(event) =>
            onChange({
              ...values,
              status:
                DOCUMENT_STATUSES.find((status) => status === event.currentTarget.value) ?? '',
            })
          }
          value={values.status}
        >
          <option value="">{t('documents.filters.anyStatus')}</option>
          {DOCUMENT_STATUSES.filter((status) => status !== 'ARCHIVED' || access.canSeeArchived).map(
            (status) => (
              <option key={status} value={status}>
                {t(`documents.status.${status}`)}
              </option>
            ),
          )}
        </Select>
        <Select
          label={t('documents.filters.source')}
          name="source"
          onChange={(event) =>
            onChange({
              ...values,
              source: DOCUMENT_SOURCES.find((source) => source === event.currentTarget.value) ?? '',
            })
          }
          value={values.source}
        >
          <option value="">{t('documents.filters.anySource')}</option>
          {DOCUMENT_SOURCES.map((source) => (
            <option key={source} value={source}>
              {t(`documents.source.${source}`)}
            </option>
          ))}
        </Select>
        {access.canSeeArchived ? (
          <Select
            label={t('documents.filters.lifecycle')}
            name="lifecycle"
            onChange={(event) =>
              onChange({
                ...values,
                lifecycle:
                  LIFECYCLES.find((lifecycle) => lifecycle === event.currentTarget.value) ??
                  'current',
              })
            }
            value={values.lifecycle}
          >
            {LIFECYCLES.map((lifecycle) => (
              <option key={lifecycle} value={lifecycle}>
                {t(`documents.filters.lifecycleOptions.${lifecycle}`)}
              </option>
            ))}
          </Select>
        ) : null}
        {access.pickClients ? (
          <DocumentOptionPicker
            emptyLabel={t('documents.filters.anyClient')}
            hint={t('documents.filters.pickerHint')}
            label={t('documents.filters.client')}
            loadOptions={loadOptions('client')}
            onChange={(client) => onChange({ ...values, client })}
            sourceKey={`${sessionKey}:filter:client`}
            value={values.client}
          />
        ) : null}
        {access.pickCandidates ? (
          <DocumentOptionPicker
            emptyLabel={t('documents.filters.anyCandidate')}
            hint={t('documents.filters.pickerHint')}
            label={t('documents.filters.candidate')}
            loadOptions={loadOptions('candidate')}
            onChange={(candidate) => onChange({ ...values, candidate })}
            sourceKey={`${sessionKey}:filter:candidate`}
            value={values.candidate}
          />
        ) : null}
        {access.pickMissions ? (
          <DocumentOptionPicker
            emptyLabel={t('documents.filters.anyMission')}
            hint={t('documents.filters.pickerHint')}
            label={t('documents.filters.mission')}
            loadOptions={loadOptions('mission')}
            onChange={(mission) => onChange({ ...values, mission })}
            sourceKey={`${sessionKey}:filter:mission`}
            value={values.mission}
          />
        ) : null}
      </div>
      <div className="document-filters__actions">
        <Button disabled={busy} size="compact" type="submit" variant="primary">
          {t('documents.filters.submit')}
        </Button>
        {showReset ? (
          <Button
            disabled={busy}
            onClick={onReset}
            size="compact"
            type="button"
            variant="secondary"
          >
            {t('documents.filters.reset')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
