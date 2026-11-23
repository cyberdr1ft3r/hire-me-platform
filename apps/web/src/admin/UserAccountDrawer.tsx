import {
  AdminCreateUserRequestSchema,
  AdminUpdateUserRequestSchema,
  type AdminUserDetail,
} from '@hire-me/contracts';
import { useId, useRef, useState, type FormEvent } from 'react';

import { AdminRequestError, createAdminUser, updateAdminUser } from '../api.js';
import { useI18n, type PlainMessageKey } from '../i18n/index.js';
import { CreationDrawer, InlineMessage, TextField } from '../ui/index.js';

type Field = 'displayName' | 'email' | 'locale' | 'initialPassword';
type Errors = Partial<Record<Field, PlainMessageKey>>;

const fieldErrors: Record<Field, PlainMessageKey> = {
  displayName: 'admin.users.validation.name',
  email: 'admin.users.validation.email',
  locale: 'admin.users.validation.locale',
  initialPassword: 'admin.users.validation.password',
};

export function UserAccountDrawer({
  accessToken,
  onClose,
  onSaved,
  user,
}: {
  accessToken: string;
  onClose: () => void;
  onSaved: (user: AdminUserDetail, message: PlainMessageKey) => void;
  user?: AdminUserDetail;
}) {
  const { t } = useI18n();
  const formId = useId();
  const initialName = user?.displayName ?? '';
  const initialLocale = user?.locale ?? 'en';
  const [displayName, setDisplayName] = useState(initialName);
  const [locale, setLocale] = useState(initialLocale);
  const [email, setEmail] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<PlainMessageKey | null>(null);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const dirty =
    displayName !== initialName || locale !== initialLocale || email !== '' || hasPassword;

  function clearError(field: Field) {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFailure(null);
  }

  function showErrors(form: HTMLFormElement, next: Errors) {
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) {
      requestAnimationFrame(() => {
        const input = form.elements.namedItem(first);
        if (input instanceof HTMLElement) input.focus();
      });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    const form = event.currentTarget;
    setFailure(null);
    const profile = { displayName, locale };
    const initialPassword = new FormData(form).get('initialPassword');
    const creation = AdminCreateUserRequestSchema.safeParse({
      ...profile,
      email: email.trim(),
      initialPassword,
    });
    const update = AdminUpdateUserRequestSchema.safeParse(profile);
    const validation = user ? update : creation;
    if (!validation.success) {
      const next: Errors = {};
      for (const issue of validation.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && Object.hasOwn(fieldErrors, field)) {
          next[field as Field] = fieldErrors[field as Field];
        }
      }
      showErrors(form, next);
      return;
    }

    saving.current = true;
    setPending(true);
    setErrors({});
    try {
      if (user && update.success) {
        const response = await updateAdminUser(accessToken, user.id, update.data);
        onSaved(response.user, 'admin.users.feedback.updated');
      } else if (creation.success) {
        const response = await createAdminUser(accessToken, creation.data);
        form.reset();
        onSaved(response.user, 'admin.users.feedback.created');
      }
    } catch (error) {
      const code = error instanceof AdminRequestError ? error.code : null;
      if (code === 'USER_EMAIL_ALREADY_EXISTS') {
        showErrors(form, { email: 'admin.users.validation.duplicateEmail' });
      } else if (code === 'INITIAL_PASSWORD_POLICY_FAILED') {
        showErrors(form, { initialPassword: 'admin.users.validation.passwordPolicy' });
      } else {
        setFailure(
          error instanceof AdminRequestError && error.status === 403
            ? 'admin.users.feedback.denied'
            : 'admin.users.feedback.failed',
        );
      }
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return (
    <CreationDrawer
      description={user ? user.email : t('admin.users.create.description')}
      dirty={dirty}
      error={
        failure ? (
          <InlineMessage announce title={t(failure)} tone="danger">
            {null}
          </InlineMessage>
        ) : undefined
      }
      formId={formId}
      onClose={onClose}
      submitLabel={t(user ? 'common.actions.save' : 'admin.users.create.submit')}
      submitting={pending}
      title={
        user
          ? t('admin.users.editTitle', { name: user.displayName })
          : t('admin.users.create.title')
      }
    >
      <form
        className="admin-users__form"
        id={formId}
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <TextField
          autoComplete="off"
          error={errors.displayName ? t(errors.displayName) : undefined}
          label={t('admin.users.fields.displayName')}
          maxLength={120}
          name="displayName"
          onChange={(event) => {
            setDisplayName(event.currentTarget.value);
            clearError('displayName');
          }}
          readOnly={pending}
          required
          value={displayName}
        />
        {!user ? (
          <TextField
            autoComplete="off"
            error={errors.email ? t(errors.email) : undefined}
            label={t('admin.users.fields.email')}
            maxLength={254}
            name="email"
            onChange={(event) => {
              setEmail(event.currentTarget.value);
              clearError('email');
            }}
            readOnly={pending}
            required
            type="email"
            value={email}
          />
        ) : null}
        <TextField
          error={errors.locale ? t(errors.locale) : undefined}
          hint={t('admin.users.validation.localeHint')}
          label={t('admin.users.fields.locale')}
          list={formId + '-locales'}
          maxLength={12}
          name="locale"
          onChange={(event) => {
            setLocale(event.currentTarget.value);
            clearError('locale');
          }}
          readOnly={pending}
          required
          value={locale}
        />
        <datalist id={formId + '-locales'}>
          <option value="en">{t('admin.users.languages.en')}</option>
          <option value="fr">{t('admin.users.languages.fr')}</option>
        </datalist>
        {!user ? (
          <TextField
            autoComplete="new-password"
            error={errors.initialPassword ? t(errors.initialPassword) : undefined}
            hint={t('admin.users.validation.passwordPolicy')}
            label={t('admin.users.fields.initialPassword')}
            maxLength={256}
            name="initialPassword"
            onChange={(event) => {
              setHasPassword(Boolean(event.currentTarget.value));
              clearError('initialPassword');
            }}
            readOnly={pending}
            required
            type="password"
          />
        ) : null}
      </form>
    </CreationDrawer>
  );
}
