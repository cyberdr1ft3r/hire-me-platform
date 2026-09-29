import type { CandidateEvaluation, EvaluationCreateRequest } from '@hire-me/contracts';
import type { FormEvent } from 'react';

import { useI18n } from '../i18n/index.js';
import { Button, Checkbox, Select, StatusBadge, TextArea, TextField } from '../ui/index.js';
import { SectionStatus } from './MissionBits.js';
import type { MissionAccess } from './mission-access.js';
import { formValue, optionalFormValue } from './mission-form.js';
import {
  EVALUATION_RECOMMENDATIONS,
  EVALUATION_SCORES,
  EVALUATION_TYPES,
  evaluationScoreLabelKey,
  evaluationStatusLabelKey,
  evaluationStatusTone,
  evaluationTypeLabelKey,
  recommendationLabelKey,
  type EvaluationScoreField,
} from './mission-labels.js';
import type { SectionState } from './mission-state.js';

type ScoreKey = keyof CandidateEvaluation['scores'];

/** Response scores drop the request's `Score` suffix (`overallScore` → `overall`). */
function scoreKey(field: EvaluationScoreField): ScoreKey {
  return field.replace(/Score$/, '') as ScoreKey;
}

function scoreValue(formData: FormData, name: string): number | undefined {
  const value = formValue(formData, name).trim();
  return value === '' ? undefined : Number(value);
}

export interface MissionEvaluationsModel {
  evaluations: SectionState<CandidateEvaluation[]>;
  onCreate: (input: EvaluationCreateRequest) => Promise<boolean>;
  onFinalize: (evaluation: CandidateEvaluation) => void;
  onRetry: () => void;
}

export function MissionEvaluations({
  access,
  editable,
  model,
  writesLocked,
}: {
  access: MissionAccess;
  editable: boolean;
  model: MissionEvaluationsModel;
  writesLocked: boolean;
}) {
  const { formatNumber, t } = useI18n();

  return (
    <div className="mission-group">
      <h6 className="mission-minor-title">{t('missions.evaluations.title')}</h6>
      <SectionStatus onRetry={model.onRetry} section={model.evaluations}>
        {(evaluations) =>
          evaluations.length === 0 ? (
            <p className="mission-muted">{t('missions.evaluations.empty')}</p>
          ) : (
            <ul aria-label={t('missions.evaluations.region')} className="mission-cards">
              {evaluations.map((evaluation) => {
                const scores = EVALUATION_SCORES.map((field) => ({
                  field,
                  value: evaluation.scores[scoreKey(field)],
                })).filter((entry): entry is { field: EvaluationScoreField; value: number } =>
                  entry.value !== null,
                );
                return (
                  <li className="mission-card" key={evaluation.id}>
                    <p className="mission-inline">
                      <strong>{t(evaluationTypeLabelKey(evaluation.evaluationType))}</strong>
                      <StatusBadge tone={evaluationStatusTone(evaluation.status)}>
                        {t(evaluationStatusLabelKey(evaluation.status))}
                      </StatusBadge>
                      {evaluation.recommendation ? (
                        <span>{t(recommendationLabelKey(evaluation.recommendation))}</span>
                      ) : null}
                    </p>
                    <p className="mission-muted">
                      {t('missions.evaluations.author', { name: evaluation.authorDisplayName })}
                    </p>
                    {scores.length > 0 ? (
                      <dl className="mission-summary mission-summary--compact">
                        {scores.map((score) => (
                          <div className="mission-summary__item" key={score.field}>
                            <dt>{t(evaluationScoreLabelKey(score.field))}</dt>
                            <dd className="u-tabular">
                              {t('missions.evaluations.scoreValue', {
                                score: formatNumber(score.value),
                              })}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    {(
                      [
                        ['strengths', 'missions.evaluations.create.strengths'],
                        ['weaknesses', 'missions.evaluations.create.weaknesses'],
                        ['risks', 'missions.evaluations.create.risks'],
                        ['comment', 'missions.evaluations.create.comment'],
                      ] as const
                    ).map(([field, label]) =>
                      evaluation[field] ? (
                        <div className="mission-prose" key={field}>
                          <p className="mission-minor-title">{t(label)}</p>
                          <p>{evaluation[field]}</p>
                        </div>
                      ) : null,
                    )}
                    {evaluation.redacted ? (
                      <p className="mission-muted">{t('missions.evaluations.redacted')}</p>
                    ) : null}
                    {editable && access.canFinalizeEvaluations && evaluation.status === 'DRAFT' ? (
                      <div className="mission-actions">
                        <Button
                          disabled={writesLocked}
                          onClick={() => model.onFinalize(evaluation)}
                          size="compact"
                          variant="secondary"
                        >
                          {t('missions.evaluations.finalize')}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )
        }
      </SectionStatus>
      {editable && access.canCreateEvaluations ? (
        <EvaluationCreateForm model={model} writesLocked={writesLocked} />
      ) : null}
    </div>
  );
}

function EvaluationCreateForm({
  model,
  writesLocked,
}: {
  model: MissionEvaluationsModel;
  writesLocked: boolean;
}) {
  const { t } = useI18n();
  const title = t('missions.evaluations.create.title');

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const evaluationType =
      EVALUATION_TYPES.find((type) => type === formValue(data, 'evaluationType')) ?? 'INTERNAL_HR';
    const recommendation = EVALUATION_RECOMMENDATIONS.find(
      (entry) => entry === formValue(data, 'recommendation'),
    );
    const input: EvaluationCreateRequest = {
      evaluationType,
      recommendation,
      overallScore: scoreValue(data, 'overallScore'),
      communicationScore: scoreValue(data, 'communicationScore'),
      technicalScore: scoreValue(data, 'technicalScore'),
      roleFitScore: scoreValue(data, 'roleFitScore'),
      cultureFitScore: scoreValue(data, 'cultureFitScore'),
      motivationScore: scoreValue(data, 'motivationScore'),
      salaryAlignmentScore: scoreValue(data, 'salaryAlignmentScore'),
      strengths: optionalFormValue(data, 'strengths'),
      weaknesses: optionalFormValue(data, 'weaknesses'),
      risks: optionalFormValue(data, 'risks'),
      comment: optionalFormValue(data, 'comment'),
      finalOpinion: data.get('finalOpinion') === 'on',
      clientVisible: false,
    };
    if (await model.onCreate(input)) {
      form.reset();
    }
  }

  return (
    <form aria-label={title} className="mission-form" onSubmit={(event) => void handleSubmit(event)}>
      <p className="mission-minor-title">{title}</p>
      <div className="mission-form__grid">
        <Select defaultValue="INTERNAL_HR" label={t('missions.evaluations.create.type')} name="evaluationType">
          {EVALUATION_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(evaluationTypeLabelKey(type))}
            </option>
          ))}
        </Select>
        <Select
          defaultValue=""
          label={t('missions.evaluations.create.recommendation')}
          name="recommendation"
        >
          <option value="">{t('missions.notRecorded')}</option>
          {EVALUATION_RECOMMENDATIONS.map((entry) => (
            <option key={entry} value={entry}>
              {t(recommendationLabelKey(entry))}
            </option>
          ))}
        </Select>
        {EVALUATION_SCORES.map((field) => (
          <TextField
            inputMode="numeric"
            key={field}
            label={t(evaluationScoreLabelKey(field))}
            max={5}
            min={1}
            name={field}
            step={1}
            type="number"
          />
        ))}
      </div>
      <TextArea label={t('missions.evaluations.create.strengths')} maxLength={2000} name="strengths" rows={2} />
      <TextArea label={t('missions.evaluations.create.weaknesses')} maxLength={2000} name="weaknesses" rows={2} />
      <TextArea label={t('missions.evaluations.create.risks')} maxLength={2000} name="risks" rows={2} />
      <TextArea label={t('missions.evaluations.create.comment')} maxLength={3000} name="comment" rows={3} />
      <Checkbox label={t('missions.evaluations.create.finalOpinion')} name="finalOpinion" />
      <div className="mission-actions">
        <Button disabled={writesLocked} type="submit" variant="primary">
          {t('missions.evaluations.create.submit')}
        </Button>
      </div>
    </form>
  );
}
