import type { TrainingParticipantDisplay, TrainingParticipantType } from '@hire-me/contracts';

import { useI18n } from '../i18n/index.js';

/**
 * A participant as the server presented them to this account.
 *
 * `display` is null when the account may not read the participant's source
 * record (a candidate without `candidates:view`, a client contact without client
 * and contact access). That renders a neutral restricted state: no name, email,
 * or identifier is ever substituted for it.
 */
export function ParticipantIdentity({
  display,
  participantType,
}: {
  display: TrainingParticipantDisplay | null;
  participantType: TrainingParticipantType;
}) {
  const { t } = useI18n();
  const type = t(`training.participantType.${participantType}`);

  if (!display) {
    return (
      <span className="training-participant training-participant--restricted">
        <span className="training-participant__name">{t('training.participant.restricted')}</span>
        <span className="training-participant__meta">
          {type} · {t('training.participant.restrictedHint')}
        </span>
      </span>
    );
  }

  return (
    <span className="training-participant">
      <span className="training-participant__name">{display.displayName}</span>
      <span className="training-participant__meta">
        {display.email ? `${type} · ${display.email}` : type}
      </span>
    </span>
  );
}
