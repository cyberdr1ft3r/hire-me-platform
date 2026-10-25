import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Decides whether the protected staging deployment may continue.
 *
 * Environment-scoped variables are only available after GitHub has started the job in
 * that Environment, so this decision must run as a step rather than a job-level `if`.
 * Missing, mixed-case, or whitespace-padded values fail closed.
 */
export function decideStagingDeployment({
  eventName,
  manualConfirmation,
  workflowConclusion,
  workflowHeadBranch,
  autoDeployEnabled,
}) {
  if (eventName === 'workflow_dispatch') {
    return manualConfirmation === 'DEPLOY'
      ? { deploy: true, reason: 'protected manual deployment confirmed' }
      : { deploy: false, reason: 'manual confirmation was not exactly DEPLOY' };
  }

  if (eventName === 'workflow_run') {
    if (workflowConclusion !== 'success' || workflowHeadBranch !== 'main') {
      return { deploy: false, reason: 'triggering CI run was not a successful main run' };
    }
    return autoDeployEnabled === 'true'
      ? { deploy: true, reason: 'protected Environment explicitly enabled automatic deployment' }
      : { deploy: false, reason: 'automatic deployment is absent or not exactly true' };
  }

  return { deploy: false, reason: `unsupported event ${eventName || '(missing)'}` };
}

function runFromEnvironment() {
  const decision = decideStagingDeployment({
    eventName: process.env.GITHUB_EVENT_NAME ?? '',
    manualConfirmation: process.env.MANUAL_CONFIRMATION ?? '',
    workflowConclusion: process.env.WORKFLOW_CONCLUSION ?? '',
    workflowHeadBranch: process.env.WORKFLOW_HEAD_BRANCH ?? '',
    autoDeployEnabled: process.env.STAGING_AUTO_DEPLOY_ENABLED ?? '',
  });
  const output = `deploy=${String(decision.deploy)}\nreason=${decision.reason}\n`;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, output, { encoding: 'utf8' });
  } else {
    process.stdout.write(output);
  }
  process.stderr.write(`Staging deployment gate: ${decision.reason}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFromEnvironment();
}
