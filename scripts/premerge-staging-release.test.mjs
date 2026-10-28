import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  REQUIRED_CI_JOBS,
  selectSuccessfulCiRun,
  validateAttestationResults,
  validateChangedFiles,
  validateCiJobs,
  validateDispatchInput,
  validatePullRequest,
} from './premerge-staging-release.mjs';

const repository = 'cyberdr1ft3r/hire-me-platform';
const releaseSha = '6ff6698791577d337ea05792fdfcf3009eed2142';
const expected = { repository, prNumber: 253, releaseSha };

test('pins privileged actions and builds with the trusted main Dockerfile', () => {
  const workflow = readFileSync('.github/workflows/deploy-pr-staging.yml', 'utf8');
  const actionRefs = [...workflow.matchAll(/^\s*uses:\s+[^@\s]+@([^\s#]+)/gm)].map(
    (match) => match[1],
  );
  assert.ok(actionRefs.length > 0);
  assert.ok(actionRefs.every((ref) => /^[0-9a-f]{40}$/.test(ref)));
  assert.match(workflow, /file: trusted\/\$\{\{ matrix\.file \}\}/);
  assert.doesNotMatch(workflow, /file: source\/\$\{\{ matrix\.file \}\}/);
  assert.equal(workflow.match(/--source-digest "\$GITHUB_SHA"/g)?.length, 4);
});

test('accepts only an exact main-defined dispatch and confirmation', () => {
  assert.deepEqual(
    validateDispatchInput({
      prNumber: '253',
      releaseSha,
      confirmation: `DEPLOY PR-253 ${releaseSha}`,
      githubRef: 'refs/heads/main',
      workflowRef: `${repository}/.github/workflows/deploy-pr-staging.yml@refs/heads/main`,
      repository,
    }),
    { prNumber: 253, releaseSha },
  );

  for (const override of [
    { confirmation: 'DEPLOY' },
    { githubRef: 'refs/heads/feat/client-libre-invoices' },
    {
      workflowRef: `${repository}/.github/workflows/deploy-pr-staging.yml@refs/heads/feat/client-libre-invoices`,
    },
    { releaseSha: releaseSha.toUpperCase() },
  ]) {
    assert.throws(() =>
      validateDispatchInput({
        prNumber: '253',
        releaseSha,
        confirmation: `DEPLOY PR-253 ${releaseSha}`,
        githubRef: 'refs/heads/main',
        workflowRef: `${repository}/.github/workflows/deploy-pr-staging.yml@refs/heads/main`,
        repository,
        ...override,
      }),
    );
  }
});

test('accepts only the current head of an open same-repository PR to main', () => {
  const pullRequest = {
    number: 253,
    state: 'open',
    base: { ref: 'main' },
    head: { sha: releaseSha, repo: { full_name: repository } },
  };
  assert.doesNotThrow(() => validatePullRequest(pullRequest, expected));
  assert.throws(() =>
    validatePullRequest(
      { ...pullRequest, head: { ...pullRequest.head, sha: 'a'.repeat(40) } },
      expected,
    ),
  );
  assert.throws(() =>
    validatePullRequest(
      { ...pullRequest, head: { ...pullRequest.head, repo: { full_name: 'attacker/fork' } } },
      expected,
    ),
  );
});

test('refuses changes to trusted release controls but permits application migrations', () => {
  assert.doesNotThrow(() =>
    validateChangedFiles([
      { filename: 'apps/api/src/commercial/commercial.service.ts' },
      { filename: 'apps/api/prisma/migrations/20261027120000_invoice_manual_client/migration.sql' },
    ]),
  );
  for (const filename of [
    '.github/workflows/ci.yml',
    'deploy/staging/compose.yml',
    'apps/api/Dockerfile',
    'apps/web/Dockerfile',
    '.dockerignore',
    'scripts/premerge-staging-release.mjs',
  ]) {
    assert.throws(() => validateChangedFiles([{ filename }]));
  }
});

test('selects only successful exact-head CI associated with the selected PR', () => {
  const valid = {
    id: 40603403092,
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    head_sha: releaseSha,
    pull_requests: [{ number: 253 }],
  };
  assert.equal(selectSuccessfulCiRun([valid], expected).id, valid.id);
  assert.throws(() => selectSuccessfulCiRun([{ ...valid, conclusion: 'failure' }], expected));
  assert.throws(() =>
    selectSuccessfulCiRun([{ ...valid, pull_requests: [{ number: 252 }] }], expected),
  );
});

test('requires every named CI job to pass', () => {
  const jobs = REQUIRED_CI_JOBS.map((name) => ({ name, conclusion: 'success' }));
  assert.doesNotThrow(() => validateCiJobs(jobs));
  assert.throws(() => validateCiJobs(jobs.slice(1)));
  assert.throws(() =>
    validateCiJobs(jobs.map((job, index) => (index ? job : { ...job, conclusion: 'skipped' }))),
  );
});

test('requires a verified digest attestation bound to PR, SHA, and CI run', () => {
  const attestation = {
    verificationResult: {
      statement: {
        predicateType: 'https://hire-me.dr1ft3r.dev/attestations/premerge-staging/v1',
        predicate: {
          schemaVersion: 1,
          repository,
          pullRequest: 253,
          releaseSha,
          ciRunId: 40603403092,
        },
      },
    },
  };
  const attestationExpected = { ...expected, ciRunId: 40603403092 };
  assert.doesNotThrow(() => validateAttestationResults([attestation], attestationExpected));
  assert.throws(() =>
    validateAttestationResults(
      [
        {
          ...attestation,
          verificationResult: {
            statement: {
              ...attestation.verificationResult.statement,
              predicate: {
                ...attestation.verificationResult.statement.predicate,
                releaseSha: 'a'.repeat(40),
              },
            },
          },
        },
      ],
      attestationExpected,
    ),
  );
});
