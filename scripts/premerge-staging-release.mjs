import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REQUIRED_CI_JOBS = Object.freeze([
  'PostgreSQL Docker Compose health',
  'Quality checks',
  'PKCS#11 SoftHSM signing lab (Issue',
  'Database migration, seed, and integration tests',
  'Container image (api)',
  'Container image (web)',
]);

export const PROTECTED_RELEASE_PATHS = Object.freeze([
  '.dockerignore',
  '.github/',
  'apps/api/Dockerfile',
  'apps/web/Dockerfile',
  'deploy/',
  'scripts/premerge-staging-release.mjs',
  'scripts/premerge-staging-release.test.mjs',
  'scripts/staging-deploy-gate.mjs',
  'scripts/staging-deploy-gate.test.mjs',
]);

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const PR_PATTERN = /^[1-9][0-9]*$/;
const CUSTOM_PREDICATE_TYPE = 'https://hire-me.dr1ft3r.dev/attestations/premerge-staging/v1';

function refusal(message) {
  throw new Error(`Pre-merge staging release refused: ${message}`);
}

export function validateDispatchInput(input) {
  if (!PR_PATTERN.test(input.prNumber)) refusal('PR number must be a positive integer.');
  if (!SHA_PATTERN.test(input.releaseSha)) {
    refusal('release SHA must be exactly 40 lowercase hexadecimal characters.');
  }
  const expectedConfirmation = `DEPLOY PR-${input.prNumber} ${input.releaseSha}`;
  if (input.confirmation !== expectedConfirmation) {
    refusal(`confirmation must be exactly "${expectedConfirmation}".`);
  }
  if (input.githubRef !== 'refs/heads/main') {
    refusal('the trusted workflow must be dispatched from main.');
  }
  const expectedWorkflowRef = `${input.repository}/.github/workflows/deploy-pr-staging.yml@refs/heads/main`;
  if (input.workflowRef !== expectedWorkflowRef) {
    refusal('the workflow definition must come from trusted main.');
  }
  return { prNumber: Number(input.prNumber), releaseSha: input.releaseSha };
}

export function validatePullRequest(pullRequest, expected) {
  if (pullRequest.number !== expected.prNumber) refusal('GitHub returned a different PR.');
  if (pullRequest.state !== 'open') refusal('the selected PR is not open.');
  if (pullRequest.base?.ref !== 'main') refusal('the selected PR does not target main.');
  if (pullRequest.head?.sha !== expected.releaseSha) {
    refusal('the selected SHA is not the current PR head.');
  }
  if (pullRequest.head?.repo?.full_name !== expected.repository) {
    refusal('fork pull requests cannot use staging deployment credentials.');
  }
}

function isProtectedPath(path) {
  return PROTECTED_RELEASE_PATHS.some((entry) =>
    entry.endsWith('/') ? path.startsWith(entry) : path === entry,
  );
}

export function validateChangedFiles(files) {
  const protectedFiles = files.map((file) => file.filename).filter(isProtectedPath);
  if (protectedFiles.length > 0) {
    refusal(`release-control files changed: ${protectedFiles.sort().join(', ')}.`);
  }
}

export function selectSuccessfulCiRun(runs, expected) {
  const run = runs
    .filter(
      (candidate) =>
        candidate.event === 'pull_request' &&
        candidate.status === 'completed' &&
        candidate.conclusion === 'success' &&
        candidate.head_sha === expected.releaseSha &&
        candidate.pull_requests?.some((pullRequest) => pullRequest.number === expected.prNumber),
    )
    .sort((left, right) => right.id - left.id)[0];
  if (!run) refusal('no successful exact-head pull-request CI run was found.');
  return run;
}

export function validateCiJobs(jobs) {
  const conclusions = new Map(jobs.map((job) => [job.name, job.conclusion]));
  const missingOrFailed = REQUIRED_CI_JOBS.filter((name) => conclusions.get(name) !== 'success');
  if (missingOrFailed.length > 0) {
    refusal(`required CI jobs are missing or not successful: ${missingOrFailed.join(', ')}.`);
  }
}

export function validateAttestationResults(results, expected) {
  const valid = results.some((result) => {
    const statement = result?.verificationResult?.statement;
    const predicate = statement?.predicate;
    return (
      statement?.predicateType === CUSTOM_PREDICATE_TYPE &&
      predicate?.schemaVersion === 1 &&
      predicate?.repository === expected.repository &&
      predicate?.pullRequest === expected.prNumber &&
      predicate?.releaseSha === expected.releaseSha &&
      predicate?.ciRunId === expected.ciRunId
    );
  });
  if (!valid)
    refusal('no verified attestation binds this digest to the selected PR, SHA, and CI run.');
}

async function githubJson(path, token) {
  const response = await fetch(`${process.env.GITHUB_API_URL ?? 'https://api.github.com'}${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) refusal(`GitHub API ${path} returned ${response.status}.`);
  return response.json();
}

async function githubPages(path, token, property = null) {
  const values = [];
  for (let page = 1; page <= 30; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const body = await githubJson(`${path}${separator}per_page=100&page=${page}`, token);
    const pageValues = property ? body[property] : body;
    if (!Array.isArray(pageValues)) refusal(`GitHub API ${path} returned an unexpected shape.`);
    values.push(...pageValues);
    if (pageValues.length < 100) return values;
  }
  refusal(`GitHub API ${path} exceeded the bounded pagination limit.`);
}

async function authorize() {
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const token = process.env.GITHUB_TOKEN ?? '';
  if (!repository || !token) refusal('trusted GitHub repository context is missing.');
  const input = validateDispatchInput({
    prNumber: process.env.PR_NUMBER ?? '',
    releaseSha: process.env.RELEASE_SHA ?? '',
    confirmation: process.env.DEPLOY_CONFIRMATION ?? '',
    githubRef: process.env.GITHUB_REF ?? '',
    workflowRef: process.env.GITHUB_WORKFLOW_REF ?? '',
    repository,
  });
  const expected = { ...input, repository };
  const pullRequest = await githubJson(`/repos/${repository}/pulls/${input.prNumber}`, token);
  validatePullRequest(pullRequest, expected);
  const files = await githubPages(`/repos/${repository}/pulls/${input.prNumber}/files`, token);
  validateChangedFiles(files);
  const runs = await githubPages(
    `/repos/${repository}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${input.releaseSha}&status=completed`,
    token,
    'workflow_runs',
  );
  const run = selectSuccessfulCiRun(runs, expected);
  const jobs = await githubPages(
    `/repos/${repository}/actions/runs/${run.id}/jobs?filter=latest`,
    token,
    'jobs',
  );
  validateCiJobs(jobs);

  const output = process.env.GITHUB_OUTPUT;
  if (!output) refusal('GITHUB_OUTPUT is missing.');
  appendFileSync(
    output,
    `pr_number=${input.prNumber}\nrelease_sha=${input.releaseSha}\nci_run_id=${run.id}\n`,
  );
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    appendFileSync(
      summary,
      `## Authorized pre-merge staging release\n\n- PR: #${input.prNumber}\n- SHA: \`${input.releaseSha}\`\n- CI run: ${run.html_url}\n- Head: \`${pullRequest.head.ref}\`\n`,
    );
  }
}

async function verifyAttestation() {
  const input = [];
  for await (const chunk of process.stdin) input.push(chunk);
  let results;
  try {
    results = JSON.parse(Buffer.concat(input).toString('utf8'));
  } catch {
    refusal('attestation verifier did not return JSON.');
  }
  if (!Array.isArray(results)) refusal('attestation verifier returned an unexpected shape.');
  validateAttestationResults(results, {
    repository: process.env.GITHUB_REPOSITORY ?? '',
    prNumber: Number(process.env.PR_NUMBER),
    releaseSha: process.env.RELEASE_SHA ?? '',
    ciRunId: Number(process.env.CI_RUN_ID),
  });
}

async function main() {
  const command = process.argv[2] ?? 'authorize';
  if (command === 'authorize') return authorize();
  if (command === 'verify-attestation') return verifyAttestation();
  refusal(`unsupported command ${command}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Pre-merge staging release refused.');
    process.exitCode = 1;
  });
}
