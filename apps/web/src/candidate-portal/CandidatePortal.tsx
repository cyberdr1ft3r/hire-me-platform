import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  CandidateGoogleResultSchema,
  candidateReturnPath,
  type CandidateApplication,
} from '@hire-me/contracts';

import { useI18n } from '../i18n/index.js';
import { PublicSite } from '../public-opportunities/PublicSite.js';
import { Button, TextField } from '../ui/index.js';
import {
  candidateApplications,
  candidateConfig,
  candidateRequest,
  candidateSession,
} from './api.js';
import { CandidateGoogleButton } from './CandidateGoogleButton.js';

const labels = {
  en: {
    login: 'Candidate sign in',
    signup: 'Create a candidate account',
    forgot: 'Forgot password?',
    reset: 'Choose a new password',
    verify: 'Verify candidate email',
    applications: 'My applications',
    email: 'Email',
    password: 'Password',
    newPassword: 'New password',
    passwordHint:
      'Use at least 12 characters with uppercase and lowercase letters, a number and a symbol.',
    continue: 'Continue',
    sent: 'Check your email for a link if this address can be used for this request.',
    failed: 'This request could not be completed. Check your details or try again.',
    googleError: 'Google Sign-In is unavailable. You can use email instead.',
    disabled: 'The candidate portal is currently unavailable.',
    working: 'Working…',
    back: 'Back to sign in',
    logout: 'Sign out',
    empty: 'You have no applications yet.',
    jobs: 'Browse jobs',
    more: 'Load more',
    retry: 'Try again',
    RECEIVED: 'Received',
    IN_REVIEW: 'In review',
    CLOSED: 'Closed',
  },
  fr: {
    login: 'Connexion candidat',
    signup: 'Créer un compte candidat',
    forgot: 'Mot de passe oublié ?',
    reset: 'Choisir un nouveau mot de passe',
    verify: 'Vérifier votre adresse e-mail',
    applications: 'Mes candidatures',
    email: 'Adresse e-mail',
    password: 'Mot de passe',
    newPassword: 'Nouveau mot de passe',
    passwordHint:
      'Utilisez au moins 12 caractères, dont des majuscules, des minuscules, un chiffre et un symbole.',
    continue: 'Continuer',
    sent: 'Si cette adresse peut être utilisée pour cette demande, vous recevrez un lien par e-mail.',
    failed: 'La demande a échoué. Vérifiez vos informations ou réessayez.',
    googleError: 'La connexion Google est indisponible. Vous pouvez utiliser votre adresse e-mail.',
    disabled: 'Le portail candidat est actuellement indisponible.',
    working: 'Chargement…',
    back: 'Retour à la connexion',
    logout: 'Se déconnecter',
    empty: 'Vous n’avez encore aucune candidature.',
    jobs: 'Voir les offres',
    more: 'Afficher plus',
    retry: 'Réessayer',
    RECEIVED: 'Reçue',
    IN_REVIEW: 'En cours d’examen',
    CLOSED: 'Clôturée',
  },
};

const routes = {
  '/candidate/sign-in': 'login',
  '/candidate/sign-up': 'signup',
  '/candidate/forgot': 'forgot',
  '/candidate/verify': 'verify',
  '/candidate/reset': 'reset',
  '/candidate/applications': 'applications',
} as const;
type Mode = (typeof routes)[keyof typeof routes];
type Copy = typeof labels.en;

export function CandidatePortal({ pathname }: { pathname: string }) {
  const { locale } = useI18n();
  const copy = labels[locale];
  const mode: Mode = routes[pathname as keyof typeof routes] ?? 'login';
  const [config, setConfig] = useState<Awaited<ReturnType<typeof candidateConfig>> | null>(null);
  const [configError, setConfigError] = useState(false);
  useEffect(() => {
    let active = true;
    void candidateConfig().then(
      (value) => {
        if (active) setConfig(value);
      },
      () => {
        if (active) setConfigError(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return (
    <PublicSite>
      <section className="public-page public-apply">
        <h1>{copy[mode]}</h1>
        <nav aria-label={copy.applications}>
          <a href="/opportunities">{copy.jobs}</a>
        </nav>
        {!config ? (
          <p role="status">{configError ? copy.disabled : copy.working}</p>
        ) : !config.enabled ? (
          <p role="status">{copy.disabled}</p>
        ) : mode === 'applications' ? (
          <Applications copy={copy} locale={locale} />
        ) : (
          <SignIn mode={mode} copy={copy} locale={locale} clientId={config.googleClientId} />
        )}
      </section>
    </PublicSite>
  );
}

function SignIn({
  mode,
  copy,
  locale,
  clientId,
}: {
  mode: Exclude<Mode, 'applications'>;
  copy: Copy;
  locale: string;
  clientId: string | null;
}) {
  const [feedback, setFeedback] = useState<'sent' | 'failed' | 'googleError' | null>(null);
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const target = candidateReturnPath(params.get('returnTo'));
  const query = '?returnTo=' + encodeURIComponent(target);
  const completion = mode === 'verify' || mode === 'reset';
  const showPassword = mode === 'login' || (completion && params.get('provider') !== 'google');

  const onGoogleError = useCallback(() => setFeedback('googleError'), []);
  const onGoogleResult = useCallback(
    (credential: string) => {
      void candidateRequest('google', { credential, returnTo: target })
        .then((result) => {
          if (CandidateGoogleResultSchema.parse(result).verified) window.location.assign(target);
          else setFeedback('sent');
        })
        .catch(onGoogleError);
    },
    [onGoogleError, target],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    const form = new FormData(event.currentTarget);
    const email = form.get('email');
    const password = form.get('password') ?? undefined;
    try {
      if (completion) {
        await candidateRequest(mode, { token: window.location.hash.slice(1), password });
      } else if (mode === 'login') {
        await candidateRequest('login', { email, password });
      } else {
        await candidateRequest(mode === 'signup' ? 'register' : 'forgot', {
          email,
          returnTo: target,
        });
        setFeedback('sent');
        return;
      }
      window.location.assign(target);
    } catch {
      setFeedback('failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="public-form" onSubmit={(event) => void submit(event)}>
        {!completion ? (
          <TextField
            name="email"
            label={copy.email}
            type="email"
            required
            autoComplete="email"
            maxLength={254}
          />
        ) : null}
        {showPassword ? (
          <TextField
            name="password"
            label={completion ? copy.newPassword : copy.password}
            hint={completion ? copy.passwordHint : undefined}
            type="password"
            autoComplete={completion ? 'new-password' : 'current-password'}
            required
            minLength={12}
            maxLength={128}
          />
        ) : null}
        {feedback ? <p role={feedback === 'sent' ? 'status' : 'alert'}>{copy[feedback]}</p> : null}
        <Button type="submit" loading={busy} loadingLabel={copy.working}>
          {copy.continue}
        </Button>
      </form>
      {(mode === 'login' || mode === 'signup') && clientId ? (
        <CandidateGoogleButton
          clientId={clientId}
          locale={locale}
          onResult={onGoogleResult}
          onError={onGoogleError}
        />
      ) : null}
      <nav className="public-form__stack" aria-label={copy.login}>
        {mode === 'login' ? (
          <>
            <a href={'/candidate/sign-up' + query}>{copy.signup}</a>
            <a href={'/candidate/forgot' + query}>{copy.forgot}</a>
          </>
        ) : (
          <a href={'/candidate/sign-in' + query}>{copy.back}</a>
        )}
      </nav>
    </>
  );
}

function Applications({ copy, locale }: { copy: Copy; locale: string }) {
  const [items, setItems] = useState<CandidateApplication[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void candidateSession()
      .then(async (identity) => {
        if (!active) return;
        if (!identity) {
          window.location.replace('/candidate/sign-in');
          return;
        }
        const result = await candidateApplications();
        if (active) {
          setItems(result.applications);
          setNext(result.nextCursor);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  async function change(action: 'logout' | 'more') {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      if (action === 'logout') {
        await candidateRequest('logout', {});
        window.location.replace('/candidate/sign-in');
        return;
      }
      if (!next) return;
      const result = await candidateApplications(next);
      setItems((value) => [...(value ?? []), ...result.applications]);
      setNext(result.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  return (
    <>
      {failed ? <p role="alert">{copy.failed}</p> : null}
      {!items ? (
        failed ? (
          <Button
            onClick={() => {
              setFailed(false);
              setAttempt((value) => value + 1);
            }}
          >
            {copy.retry}
          </Button>
        ) : (
          <p role="status">{copy.working}</p>
        )
      ) : items.length === 0 ? (
        <p>{copy.empty}</p>
      ) : (
        <ul className="public-list__rows">
          {items.map((item) => (
            <li className="public-list__row" key={item.id}>
              <article className="public-list__item">
                <h2>{item.title}</h2>
                <p>
                  {copy[item.status]} ·{' '}
                  <time dateTime={item.submittedAt}>{date.format(new Date(item.submittedAt))}</time>
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
      {next ? (
        <Button disabled={busy} onClick={() => void change('more')}>
          {copy.more}
        </Button>
      ) : null}
      <Button disabled={busy} variant="secondary" onClick={() => void change('logout')}>
        {copy.logout}
      </Button>
    </>
  );
}
