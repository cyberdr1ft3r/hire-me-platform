import type { MeetingDetail } from '@hire-me/contracts';
import { useEffect, useRef, useState } from 'react';

import { getMeeting } from '../api.js';
import { useI18n } from '../i18n/index.js';

type DetailState =
  | { status: 'idle' }
  | { status: 'loading'; meetingId: string }
  | { status: 'ready'; meeting: MeetingDetail }
  | { status: 'error'; meetingId: string };

export function MeetingsPanel({
  accessToken,
  initialMeetingId,
}: {
  accessToken: string;
  initialMeetingId: string | null;
}) {
  const { t, formatDateTime } = useI18n();
  const tokenRef = useRef(accessToken);
  const requestRef = useRef(0);
  const [meetingId, setMeetingId] = useState<string | null>(initialMeetingId);
  const [detail, setDetail] = useState<DetailState>({ status: 'idle' });

  if (tokenRef.current !== accessToken) {
    tokenRef.current = accessToken;
    requestRef.current += 1;
  }

  useEffect(() => {
    setMeetingId(initialMeetingId);
  }, [initialMeetingId]);

  useEffect(() => {
    if (!meetingId) {
      setDetail({ status: 'idle' });
      return;
    }
    const requestId = ++requestRef.current;
    setDetail({ status: 'loading', meetingId });
    void getMeeting(accessToken, meetingId)
      .then((response) => {
        if (requestId !== requestRef.current) return;
        setDetail({ status: 'ready', meeting: response.meeting });
      })
      .catch(() => {
        if (requestId !== requestRef.current) return;
        setDetail({ status: 'error', meetingId });
      });
    return () => {
      requestRef.current += 1;
    };
  }, [accessToken, meetingId]);

  if (!meetingId) {
    return (
      <section aria-label={t('meetings.region')} className="meetings">
        <p>{t('meetings.empty.selectFromAgenda')}</p>
      </section>
    );
  }

  if (detail.status === 'loading') {
    return (
      <section aria-label={t('meetings.region')} className="meetings">
        <p>{t('meetings.loading')}</p>
      </section>
    );
  }

  if (detail.status === 'error') {
    return (
      <section aria-label={t('meetings.region')} className="meetings">
        <p role="alert">{t('meetings.errors.notFound')}</p>
      </section>
    );
  }

  const meeting = detail.meeting;
  return (
    <section aria-label={t('meetings.region')} className="meetings">
      <header className="meetings-header">
        <h1>{meeting.title}</h1>
        <p className="meetings-meta">
          {formatDateTime(meeting.scheduledStartAt, { timeZone: meeting.timezone })}
          {meeting.scheduledEndAt
            ? ` – ${formatDateTime(meeting.scheduledEndAt, { timeZone: meeting.timezone })}`
            : null}
        </p>
        <p className="meetings-meta">
          {t('meetings.fields.organizer')}: {meeting.organizerDisplayName}
        </p>
        <p className="meetings-meta">
          {t('meetings.fields.status')}: {meeting.status}
        </p>
      </header>
      {meeting.description ? <p className="meetings-description">{meeting.description}</p> : null}
      {meeting.location ? (
        <p className="meetings-meta">
          {t('meetings.fields.location')}: {meeting.location}
        </p>
      ) : null}
      {meeting.meetingUrl ? (
        <p className="meetings-meta">
          <a href={meeting.meetingUrl} rel="noreferrer" target="_blank">
            {t('meetings.fields.meetingLink')}
          </a>
        </p>
      ) : null}
      <h2>{t('meetings.participantsHeading')}</h2>
      <ul className="meetings-participants">
        {meeting.participants.map((participant) => (
          <li key={participant.id}>
            {participant.userDisplayName} — {participant.status}
          </li>
        ))}
      </ul>
    </section>
  );
}
