import { useI18n } from '../i18n/index.js';
import { InlineMessage } from '../ui/index.js';
import type { CandidateFailure } from './candidate-errors.js';
import { candidateFailureLabelKey } from './candidate-labels.js';

/**
 * Form-level feedback shown inside the form it explains.
 *
 * Field errors are already announced beside their own controls, so the
 * summary for them is static guidance; a failed request is dynamic and is
 * announced as an alert. Neither ever contains backend text.
 */
export function CandidateFormFeedback({
  failure,
  hasFieldErrors,
}: {
  failure: CandidateFailure | null;
  hasFieldErrors: boolean;
}) {
  const { t } = useI18n();

  if (failure) {
    return (
      <InlineMessage announce title={t('candidate.feedback.failureTitle')} tone="danger">
        {t(candidateFailureLabelKey(failure))}
      </InlineMessage>
    );
  }
  if (hasFieldErrors) {
    return (
      <InlineMessage title={t('candidate.validation.summaryTitle')} tone="danger">
        {t('candidate.validation.summary')}
      </InlineMessage>
    );
  }
  return null;
}
