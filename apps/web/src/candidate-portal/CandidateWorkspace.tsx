import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CandidateProfileFieldsSchema,
  publicApplicationMaxFileSizeBytes,
  type CandidateCv,
  type CandidateCvVersion,
  type CandidateProfileFields,
} from '@hire-me/contracts';

import { Button, TextArea, TextField } from '../ui/index.js';
import {
  candidateCvDownload,
  candidateCvs,
  candidateProfile,
  candidateRequest,
  CandidateRequestError,
  candidateSubmission,
  saveCandidateProfile,
  uploadCandidateCv,
} from './api.js';
import type { WorkspaceCopy } from './workspace-copy.js';
import './candidate-workspace.css';

const blank: CandidateProfileFields = {
  fullName: '',
  phone: '',
  city: '',
  country: '',
  currentPosition: '',
  summary: '',
  experience: '',
  education: '',
  skills: '',
  languages: '',
  qualifications: '',
  professionalLinks: '',
  availability: '',
};
const contactFields = ['fullName', 'phone', 'city', 'country'] as const;
const longFields = [
  'summary',
  'experience',
  'education',
  'skills',
  'languages',
  'qualifications',
  'professionalLinks',
] as const;

function authenticate(error: unknown) {
  if (error instanceof CandidateRequestError && error.status === 401) {
    window.location.replace('/candidate/sign-in');
    return false;
  }
  return true;
}

function useCandidateData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void load().then(
      (value) => {
        if (active) setData(value);
      },
      (error: unknown) => {
        if (active && authenticate(error)) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, load]);
  const reload = () => {
    setData(undefined);
    setFailed(false);
    setAttempt((value) => value + 1);
  };
  return { data, failed, reload, setData };
}

export function CandidateWorkspaceNavigation({
  copy,
  page,
}: {
  copy: WorkspaceCopy;
  page: 'profile' | 'documents' | 'applications';
}) {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    setFailed(false);
    try {
      await candidateRequest('logout', {});
      window.location.replace('/candidate/sign-in');
    } catch (error) {
      if (authenticate(error)) setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <nav className="candidate-workspace__nav" aria-label={copy.navigation}>
        {(['profile', 'documents', 'applications'] as const).map((item) => (
          <a
            key={item}
            href={'/candidate/' + item}
            aria-current={page === item ? 'page' : undefined}
          >
            {copy[item]}
          </a>
        ))}
        <a href="/opportunities">{copy.jobs}</a>
        <Button size="compact" variant="secondary" disabled={busy} onClick={() => void logout()}>
          {copy.signOut}
        </Button>
      </nav>
      {failed ? <p role="alert">{copy.error}</p> : null}
    </>
  );
}

function CandidateLoad({
  copy,
  failed,
  retry,
}: {
  copy: WorkspaceCopy;
  failed: boolean;
  retry: () => void;
}) {
  return failed ? (
    <div>
      <p role="alert">{copy.error}</p>
      <Button variant="secondary" onClick={retry}>
        {copy.retry}
      </Button>
    </div>
  ) : (
    <p role="status">{copy.loading}</p>
  );
}

export function CandidateProfilePage({ copy }: { copy: WorkspaceCopy }) {
  const profile = useCandidateData(candidateProfile);
  if (!profile.data)
    return <CandidateLoad copy={copy} failed={profile.failed} retry={profile.reload} />;
  return (
    <ProfileForm
      key={profile.data.email}
      saved={profile.data}
      copy={copy}
      reload={profile.reload}
    />
  );
}

function ProfileForm({
  saved,
  copy,
  reload,
}: {
  saved: Awaited<ReturnType<typeof candidateProfile>>;
  copy: WorkspaceCopy;
  reload: () => void;
}) {
  const [values, setValues] = useState(saved.profile ?? blank);
  const [baseline, setBaseline] = useState(saved.profile ?? blank);
  const [revision, setRevision] = useState(saved.revision);
  const [feedback, setFeedback] = useState<'saved' | 'invalid' | 'conflict' | 'error'>();
  const [issues, setIssues] = useState<Partial<Record<keyof CandidateProfileFields, string>>>({});
  const [busy, setBusy] = useState(false);
  const formId = useRef<HTMLFormElement>(null);
  const dirty = (Object.keys(values) as (keyof CandidateProfileFields)[]).some(
    (key) => values[key] !== baseline[key],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function edit(name: keyof CandidateProfileFields, value: string) {
    setValues((prior) => ({ ...prior, [name]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFeedback(undefined);
    setIssues({});
    const parsed = CandidateProfileFieldsSchema.safeParse(values);
    if (!parsed.success) {
      const fields: typeof issues = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof CandidateProfileFields;
        fields[key] =
          key === 'professionalLinks'
            ? copy.invalidLinks
            : key === 'fullName'
              ? copy.required
              : copy.invalid;
      }
      setIssues(fields);
      setFeedback('invalid');
      const first = formId.current?.elements.namedItem(Object.keys(fields)[0] ?? '');
      if (first instanceof HTMLElement) first.focus();
      return;
    }
    setBusy(true);
    try {
      const result = await saveCandidateProfile(parsed.data, revision);
      setRevision(result.revision);
      setValues(result.profile ?? blank);
      setBaseline(result.profile ?? blank);
      setFeedback('saved');
    } catch (error) {
      if (authenticate(error))
        setFeedback(
          error instanceof CandidateRequestError && error.status === 409 ? 'conflict' : 'error',
        );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      ref={formId}
      className="public-form candidate-workspace__form"
      noValidate
      onSubmit={(event) => void save(event)}
    >
      <fieldset disabled={busy}>
        <legend>{copy.contact}</legend>
        <div className="candidate-workspace__grid">
          {contactFields.map((field) => (
            <TextField
              key={field}
              name={field}
              label={copy[field]}
              value={values[field]}
              required={field === 'fullName'}
              maxLength={field === 'fullName' ? 160 : field === 'phone' ? 80 : 180}
              type={field === 'phone' ? 'tel' : 'text'}
              onChange={(event) => edit(field, event.target.value)}
              error={issues[field]}
            />
          ))}
          <TextField type="email" label={copy.email} value={saved.email} readOnly />
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>{copy.background}</legend>
        <div className="candidate-workspace__grid">
          {(['currentPosition', 'availability'] as const).map((field) => (
            <TextField
              key={field}
              name={field}
              label={copy[field]}
              value={values[field]}
              maxLength={180}
              onChange={(event) => edit(field, event.target.value)}
              error={issues[field]}
            />
          ))}
          {longFields.map((field) => (
            <TextArea
              key={field}
              name={field}
              label={copy[field]}
              value={values[field]}
              maxLength={4000}
              rows={3}
              hint={field === 'professionalLinks' ? copy.linksHint : undefined}
              onChange={(event) => edit(field, event.target.value)}
              error={issues[field]}
            />
          ))}
        </div>
      </fieldset>
      {feedback ? <p role={feedback === 'saved' ? 'status' : 'alert'}>{copy[feedback]}</p> : null}
      <div className="candidate-workspace__nav">
        <Button type="submit" loading={busy} loadingLabel={copy.loading}>
          {copy.save}
        </Button>
        {feedback === 'conflict' ? (
          <Button
            variant="secondary"
            onClick={() => {
              if (!dirty || window.confirm(copy.discard)) reload();
            }}
          >
            {copy.reload}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

type CvFeedback = 'cvSaved' | 'badFile' | 'unsafe' | 'scanner' | 'capacity' | 'error';

export function CandidateDocumentsPage({ copy, locale }: { copy: WorkspaceCopy; locale: string }) {
  const { data, failed, reload, setData } = useCandidateData(candidateCvs);
  const [editing, setEditing] = useState<string>();
  const [feedback, setFeedback] = useState<CvFeedback>();
  const [busy, setBusy] = useState(false);
  const format = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'kilobyte',
    maximumFractionDigits: 1,
  });

  async function change(operation: () => Promise<void>) {
    if (busy) return;
    setFeedback(undefined);
    setBusy(true);
    try {
      await operation();
      setFeedback('cvSaved');
    } catch (error) {
      if (!authenticate(error)) return;
      let message: CvFeedback = 'error';
      if (error instanceof CandidateRequestError) {
        if (error.code === 'CANDIDATE_SCAN_UNAVAILABLE') message = 'scanner';
        else if (error.code === 'CANDIDATE_FILE_UNSAFE') message = 'unsafe';
        else if (error.code === 'CANDIDATE_CV_CAPACITY') message = 'capacity';
        else if ([400, 413, 422].includes(error.status)) message = 'badFile';
      }
      setFeedback(message);
    } finally {
      setBusy(false);
    }
  }

  function upload(file: File, replaceId?: string) {
    if (
      file.size === 0 ||
      file.size > publicApplicationMaxFileSizeBytes ||
      !file.name.toLowerCase().endsWith('.pdf')
    ) {
      setFeedback('badFile');
      return;
    }
    void change(async () => {
      const updated = await uploadCandidateCv(file, replaceId);
      setData((prior) => [updated, ...(prior ?? []).filter((item) => item.id !== updated.id)]);
      setEditing(undefined);
    });
  }

  function prefer(cv: CandidateCv) {
    void change(async () => {
      await candidateRequest('documents/' + cv.id + '/prefer', {});
      setData((prior) => prior?.map((item) => ({ ...item, preferred: item.id === cv.id })));
    });
  }

  function remove(cv: CandidateCv) {
    if (!window.confirm(copy.removed)) return;
    void change(async () => {
      await candidateRequest('documents/' + cv.id + '/remove', {});
      setData((prior) => prior?.filter((item) => item.id !== cv.id));
    });
  }

  function version(file: CandidateCvVersion) {
    return (
      <li key={file.id}>
        <span>
          {copy.version} {file.version} · {file.filename} · {format.format(file.sizeBytes / 1024)}
        </span>{' '}
        <a href={candidateCvDownload(file.id)}>{copy.download}</a>
      </li>
    );
  }

  if (!data) return <CandidateLoad copy={copy} failed={failed} retry={reload} />;
  return (
    <>
      <p>{copy.scan}</p>
      <CvUpload copy={copy} action={copy.upload} disabled={busy} onUpload={upload} />
      {busy ? <p role="status">{copy.loading}</p> : null}
      {feedback ? <p role={feedback === 'cvSaved' ? 'status' : 'alert'}>{copy[feedback]}</p> : null}
      {!data.length ? (
        <p>{copy.empty}</p>
      ) : (
        <ul className="public-list__rows candidate-workspace__cvs">
          {data.map((cv) => (
            <li key={cv.id} className="public-list__row">
              <article className="public-list__item">
                <h2>{cv.versions[0]?.filename}</h2>
                {cv.preferred ? <p>{copy.preferred}</p> : null}
                <ul aria-label={copy.current}>{cv.versions.slice(0, 1).map(version)}</ul>
                {cv.versions.length > 1 ? (
                  <details>
                    <summary>{copy.history}</summary>
                    <ul>{cv.versions.slice(1).map(version)}</ul>
                  </details>
                ) : null}
                <div className="candidate-workspace__nav">
                  {!cv.preferred ? (
                    <Button variant="secondary" disabled={busy} onClick={() => prefer(cv)}>
                      {copy.prefer}
                    </Button>
                  ) : null}
                  <Button variant="secondary" disabled={busy} onClick={() => setEditing(cv.id)}>
                    {copy.replace}
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => remove(cv)}>
                    {copy.remove}
                  </Button>
                </div>
                {editing === cv.id ? (
                  <CvUpload
                    copy={copy}
                    action={copy.replace}
                    disabled={busy}
                    onUpload={(file) => upload(file, cv.id)}
                    onCancel={() => setEditing(undefined)}
                  />
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CvUpload({
  copy,
  action,
  disabled,
  onUpload,
  onCancel,
}: {
  copy: WorkspaceCopy;
  action: string;
  disabled: boolean;
  onUpload: (file: File) => void;
  onCancel?: () => void;
}) {
  return (
    <form
      className="public-form candidate-workspace__form"
      onSubmit={(event) => {
        event.preventDefault();
        const input = event.currentTarget.elements.namedItem('file');
        if (input instanceof HTMLInputElement && input.files?.[0]) onUpload(input.files[0]);
      }}
    >
      <TextField
        name="file"
        type="file"
        accept=".pdf,application/pdf"
        label={copy.file}
        required
        disabled={disabled}
      />
      <div className="candidate-workspace__nav">
        <Button type="submit" disabled={disabled}>
          {action}
        </Button>
        {onCancel ? (
          <Button variant="secondary" disabled={disabled} onClick={onCancel}>
            {copy.cancel}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function CandidateSubmittedDetails({ copy, id }: { copy: WorkspaceCopy; id: string }) {
  const [opened, setOpened] = useState(false);
  return (
    <div>
      <Button
        variant="secondary"
        size="compact"
        aria-expanded={opened}
        onClick={() => setOpened(!opened)}
      >
        {copy.receipt}
      </Button>
      {opened ? <SubmissionReceipt copy={copy} id={id} /> : null}
    </div>
  );
}

function SubmissionReceipt({ copy, id }: { copy: WorkspaceCopy; id: string }) {
  const [receipt, setReceipt] = useState<Awaited<ReturnType<typeof candidateSubmission>>>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void candidateSubmission(id).then(
      (value) => {
        if (active) setReceipt(value);
      },
      (error: unknown) => {
        if (active && authenticate(error)) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [id, attempt]);
  if (!receipt)
    return (
      <CandidateLoad
        copy={copy}
        failed={failed}
        retry={() => {
          setFailed(false);
          setAttempt((value) => value + 1);
        }}
      />
    );

  const fields = [
    'fullName',
    'email',
    'phone',
    'city',
    'country',
    'currentPosition',
    'skills',
    'languages',
    'availability',
    'professionalLinks',
  ] as const;
  return (
    <section className="candidate-workspace__receipt">
      <h3>{copy.receiptTitle}</h3>
      <dl>
        {fields
          .filter((key) => receipt[key])
          .map((key) => (
            <div key={key}>
              <dt>{copy[key]}</dt>
              <dd>{receipt[key]}</dd>
            </div>
          ))}
        <div>
          <dt>{copy.receiptCv}</dt>
          <dd>
            {receipt.cvFilename ?? copy.noCv}
            {receipt.libraryVersion ? ' · ' + copy.version + ' ' + receipt.libraryVersion : ''}
          </dd>
        </div>
      </dl>
    </section>
  );
}
