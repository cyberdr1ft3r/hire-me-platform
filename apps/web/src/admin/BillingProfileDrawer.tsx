import { CompanyBillingSettingsUpdateRequestSchema } from '@hire-me/contracts';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { useI18n, type PlainMessageKey } from '../i18n/index.js';
import { CreationDrawer, InlineMessage, TextArea, TextField } from '../ui/index.js';
import {
  billingGroups,
  billingWriteError,
  profileFields,
  type BillingField,
  type BillingSettings,
} from './billing-settings-state.js';

const longFields: readonly BillingField[] = ['sellerAddress', 'paymentTerms', 'bankDetails'];

export function BillingProfileDrawer({
  settings,
  onClose,
  onSave,
}: {
  settings: BillingSettings;
  onClose: () => void;
  onSave: (changes: Partial<Pick<BillingSettings, BillingField>>) => Promise<void>;
}) {
  const { t } = useI18n();
  const formId = useId();
  const [draft, setDraft] = useState(settings);
  const [errors, setErrors] = useState<Partial<Record<BillingField, PlainMessageKey>>>({});
  const [failure, setFailure] = useState<PlainMessageKey | null>(null);
  const [pending, setPending] = useState(false);
  const failureRef = useRef<HTMLDivElement>(null);
  const saving = useRef(false);
  const dirty = profileFields.some((field) => draft[field] !== settings[field]);

  useEffect(() => {
    if (failure && !pending) failureRef.current?.focus();
  }, [failure, pending]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || !dirty) return;
    const form = event.currentTarget;
    const input = { ...draft };
    for (const field of profileFields) input[field] = input[field]?.trim() || null;
    const validated = CompanyBillingSettingsUpdateRequestSchema.safeParse(input);
    setFailure(null);
    if (!validated.success) {
      const next: Partial<Record<BillingField, PlainMessageKey>> = {};
      for (const { path } of validated.error.issues) {
        const field = profileFields.find((item) => item === path[0]);
        if (!field) continue;
        next[field] =
          field === 'sellerEmail'
            ? 'admin.billing.emailInvalid'
            : field === 'sellerWebsite'
              ? 'admin.billing.websiteInvalid'
              : 'admin.billing.textInvalid';
      }
      setErrors(next);
      const first = form.elements.namedItem(Object.keys(next)[0] ?? '');
      if (first instanceof HTMLElement) first.focus();
      if (!Object.keys(next).length) setFailure('admin.billing.writeFailed');
      return;
    }

    const changes: Partial<Pick<BillingSettings, BillingField>> = {};
    for (const field of profileFields) {
      if (validated.data[field] !== settings[field]) changes[field] = validated.data[field];
    }
    if (!Object.keys(changes).length) {
      onClose();
      return;
    }
    saving.current = true;
    setPending(true);
    setErrors({});
    try {
      await onSave(changes);
    } catch (error) {
      setFailure(billingWriteError(error));
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return (
    <CreationDrawer
      description={t('admin.billing.profileOptional')}
      dirty={dirty}
      error={
        failure ? (
          <div ref={failureRef} tabIndex={-1}>
            <InlineMessage announce title={t(failure)} tone="danger">
              {null}
            </InlineMessage>
          </div>
        ) : undefined
      }
      formId={formId}
      onClose={onClose}
      submitDisabled={!dirty}
      submitting={pending}
      submitLabel={t('admin.billing.saveProfile')}
      title={t('admin.billing.editProfile')}
    >
      <form
        id={formId}
        className="billing-settings__editor"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        {billingGroups.map(({ title, fields }) => (
          <fieldset className="billing-settings__fieldset" key={title}>
            <legend>{t(title)}</legend>
            {fields.map((field) => {
              const control = {
                label: t(`admin.billing.${field}`),
                name: field,
                value: draft[field] ?? '',
                readOnly: pending,
                maxLength: field === 'sellerEmail' ? 254 : field === 'sellerWebsite' ? 500 : 1000,
                error: errors[field] ? t(errors[field]) : undefined,
              };
              const change = (value: string) => {
                setDraft((current) => ({ ...current, [field]: value || null }));
                setErrors((current) => ({ ...current, [field]: undefined }));
                setFailure(null);
              };
              return longFields.includes(field) ? (
                <TextArea
                  {...control}
                  key={field}
                  rows={3}
                  onChange={(event) => change(event.currentTarget.value)}
                />
              ) : (
                <TextField
                  {...control}
                  key={field}
                  type={
                    field === 'sellerEmail'
                      ? 'email'
                      : field === 'sellerWebsite'
                        ? 'url'
                        : field === 'sellerPhone'
                          ? 'tel'
                          : 'text'
                  }
                  onChange={(event) => change(event.currentTarget.value)}
                />
              );
            })}
          </fieldset>
        ))}
      </form>
    </CreationDrawer>
  );
}
