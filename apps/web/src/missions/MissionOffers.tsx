import type { OfferAggregate } from '@hire-me/contracts';
import { useState, type FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { parseSalaryAmount } from '../money/index.js';
import { Button, StatusBadge, TextArea, TextField } from '../ui/index.js';
import { SectionStatus, SummaryItem } from './MissionBits.js';
import type { MissionAccess } from './mission-access.js';
import {
  OFFER_RESPONSES,
  canOfferMoveTo,
  offerStatusLabelKey,
  offerStatusTone,
  type OfferResponseStatus,
} from './mission-labels.js';
import type { SectionState } from './mission-state.js';

export interface OfferCreateValues {
  offeredSalaryAmountCents: number | null;
  offeredSalaryCurrency: string;
  contractType: string;
  proposedStartDate: string;
  probationPeriod: string;
  clientFacingRemarks: string;
  internalRecruiterRemarks: string;
}

export interface MissionOffersModel {
  offer: SectionState<OfferAggregate | null>;
  onConfirmPlacement: (offer: OfferAggregate) => void;
  onCreate: (values: OfferCreateValues) => Promise<boolean>;
  onMarkSent: (offer: OfferAggregate) => void;
  onResponse: (offer: OfferAggregate, status: OfferResponseStatus) => void;
  onRetry: () => void;
  onRevise: (offer: OfferAggregate) => void;
  onWithdraw: (offer: OfferAggregate) => void;
}

export function formatMinorUnits(
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

export function MissionOffers({
  access,
  canCreateOffer,
  editable,
  model,
  placementRecorded,
  writesLocked,
}: {
  access: MissionAccess;
  /** The process is in a stage the API accepts a new offer in. */
  canCreateOffer: boolean;
  editable: boolean;
  model: MissionOffersModel;
  placementRecorded: boolean;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="mission-offer-title" className="mission-subsection">
      <h4 className="mission-subtitle" id="mission-offer-title">
        {t('missions.offers.title')}
      </h4>
      <SectionStatus onRetry={model.onRetry} section={model.offer}>
        {(offer) =>
          offer ? (
            <OfferDetail
              access={access}
              editable={editable}
              model={model}
              offer={offer}
              placementRecorded={placementRecorded}
              writesLocked={writesLocked}
            />
          ) : (
            <>
              <p className="mission-muted">{t('missions.offers.empty')}</p>
              {editable && canCreateOffer && access.canCreateOffers ? (
                <OfferCreateForm model={model} writesLocked={writesLocked} />
              ) : null}
            </>
          )
        }
      </SectionStatus>
    </section>
  );
}

function OfferDetail({
  access,
  editable,
  model,
  offer,
  placementRecorded,
  writesLocked,
}: {
  access: MissionAccess;
  editable: boolean;
  model: MissionOffersModel;
  offer: OfferAggregate;
  placementRecorded: boolean;
  writesLocked: boolean;
}) {
  const { formatCurrency, formatDate, formatNumber, t } = useI18n();
  const current = offer.versions.find((version) => version.id === offer.currentVersionId) ?? null;
  if (!current) {
    return <p className="mission-muted">{t('missions.offers.empty')}</p>;
  }
  const status = current.status;
  const responses = OFFER_RESPONSES.filter((response) => canOfferMoveTo(status, response));

  return (
    <div className="mission-group">
      <p className="mission-inline">
        <span>{t('missions.offers.current')}</span>
        <StatusBadge tone={offerStatusTone(status)}>{t(offerStatusLabelKey(status))}</StatusBadge>
        <span className="mission-muted u-tabular">
          {t('missions.offers.version', {
            count: formatNumber(offer.versions.length),
            number: formatNumber(current.versionNumber),
          })}
        </span>
      </p>
      <dl className="mission-summary">
        <SummaryItem label={t('missions.offers.fields.amount')}>
          {current.offeredSalaryAmountCents === null ? null : (
            <span className="u-tabular">
              {formatMinorUnits(
                current.offeredSalaryAmountCents,
                current.offeredSalaryCurrency,
                formatCurrency,
                formatNumber,
              )}
            </span>
          )}
        </SummaryItem>
        <SummaryItem label={t('missions.offers.fields.contractType')}>
          {current.contractType}
        </SummaryItem>
        <SummaryItem label={t('missions.offers.fields.proposedStartDate')}>
          {current.proposedStartDate ? formatDate(current.proposedStartDate) : null}
        </SummaryItem>
        <SummaryItem label={t('missions.offers.fields.probationPeriod')}>
          {current.probationPeriod}
        </SummaryItem>
        <SummaryItem label={t('missions.offers.fields.clientFacingRemarks')}>
          {current.clientFacingRemarks}
        </SummaryItem>
        <SummaryItem label={t('missions.offers.fields.internalRecruiterRemarks')}>
          {current.internalRecruiterRemarks}
        </SummaryItem>
      </dl>
      {editable ? (
        <>
          <div className="mission-actions">
            {access.canUpdateOffers ? (
              <Button
                disabled={writesLocked}
                onClick={() => model.onRevise(offer)}
                size="compact"
                variant="secondary"
              >
                {t('missions.offers.actions.revise')}
              </Button>
            ) : null}
            {access.canSendOffers && canOfferMoveTo(status, 'SENT') ? (
              <Button
                disabled={writesLocked}
                onClick={() => model.onMarkSent(offer)}
                size="compact"
                variant="secondary"
              >
                {t('missions.offers.actions.markSent')}
              </Button>
            ) : null}
            {access.canWithdrawOffers && canOfferMoveTo(status, 'WITHDRAWN') ? (
              <Button
                disabled={writesLocked}
                onClick={() => model.onWithdraw(offer)}
                size="compact"
                variant="danger"
              >
                {t('missions.offers.actions.withdraw')}
              </Button>
            ) : null}
            {access.canConfirmPlacements && status === 'ACCEPTED' && !placementRecorded ? (
              <Button
                disabled={writesLocked}
                onClick={() => model.onConfirmPlacement(offer)}
                size="compact"
                variant="primary"
              >
                {t('missions.offers.actions.confirmPlacement')}
              </Button>
            ) : null}
          </div>
          {access.canRecordOfferResponses && responses.length > 0 ? (
            <div className="mission-group">
              <h5 className="mission-minor-title">{t('missions.offers.responsesTitle')}</h5>
              <div className="mission-actions">
                {responses.map((response) => (
                  <Button
                    disabled={writesLocked}
                    key={response}
                    onClick={() => model.onResponse(offer, response)}
                    size="compact"
                    variant="secondary"
                  >
                    {t('missions.offers.recordResponse', {
                      status: t(offerStatusLabelKey(response)),
                    })}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function OfferCreateForm({
  model,
  writesLocked,
}: {
  model: MissionOffersModel;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const [amountError, setAmountError] = useState(false);
  const title = t('missions.offers.create.title');

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    const amount = parseSalaryAmount(text('offeredSalaryAmount'));
    if (!amount.ok) {
      setAmountError(true);
      return;
    }
    setAmountError(false);
    const created = await model.onCreate({
      offeredSalaryAmountCents: amount.cents,
      offeredSalaryCurrency: text('offeredSalaryCurrency'),
      contractType: text('contractType'),
      proposedStartDate: text('proposedStartDate'),
      probationPeriod: text('probationPeriod'),
      clientFacingRemarks: text('clientFacingRemarks'),
      internalRecruiterRemarks: text('internalRecruiterRemarks'),
    });
    if (created) {
      form.reset();
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
        <TextField
          autoComplete="off"
          error={amountError ? t('missions.offers.create.amountInvalid') : undefined}
          hint={t('missions.offers.create.amountHint')}
          inputMode="decimal"
          label={t('missions.offers.create.amount')}
          maxLength={16}
          name="offeredSalaryAmount"
          onChange={() => setAmountError(false)}
        />
        <TextField
          autoComplete="off"
          defaultValue="MAD"
          hint={t('missions.offers.create.currencyHint')}
          label={t('missions.offers.create.currency')}
          maxLength={3}
          minLength={3}
          name="offeredSalaryCurrency"
          pattern="[A-Za-z]{3}"
        />
        <TextField
          label={t('missions.offers.create.contractType')}
          maxLength={120}
          name="contractType"
        />
        <TextField
          label={t('missions.offers.create.proposedStartDate')}
          name="proposedStartDate"
          type="date"
        />
        <TextField
          label={t('missions.offers.create.probationPeriod')}
          maxLength={240}
          name="probationPeriod"
        />
      </div>
      <TextArea
        label={t('missions.offers.create.clientFacingRemarks')}
        maxLength={1500}
        name="clientFacingRemarks"
        rows={3}
      />
      <TextArea
        label={t('missions.offers.create.internalRecruiterRemarks')}
        maxLength={1500}
        name="internalRecruiterRemarks"
        rows={3}
      />
      <div className="mission-actions">
        <Button disabled={writesLocked} type="submit" variant="primary">
          {t('missions.offers.create.submit')}
        </Button>
      </div>
    </form>
  );
}
