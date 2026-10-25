import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decideStagingDeployment } from './staging-deploy-gate.mjs';

const base = {
  eventName: '',
  manualConfirmation: '',
  workflowConclusion: '',
  workflowHeadBranch: '',
  autoDeployEnabled: '',
};

describe('staging deployment gate', () => {
  it('allows a protected manual deployment only with the exact confirmation', () => {
    assert.equal(
      decideStagingDeployment({
        ...base,
        eventName: 'workflow_dispatch',
        manualConfirmation: 'DEPLOY',
      }).deploy,
      true,
    );
    for (const confirmation of ['', 'deploy', 'DEPLOY ', 'YES']) {
      assert.equal(
        decideStagingDeployment({
          ...base,
          eventName: 'workflow_dispatch',
          manualConfirmation: confirmation,
          autoDeployEnabled: 'true',
        }).deploy,
        false,
      );
    }
  });

  it('keeps successful main workflow runs disabled by default', () => {
    for (const value of ['', 'false', 'FALSE', 'true ', '1']) {
      assert.equal(
        decideStagingDeployment({
          ...base,
          eventName: 'workflow_run',
          workflowConclusion: 'success',
          workflowHeadBranch: 'main',
          autoDeployEnabled: value,
        }).deploy,
        false,
      );
    }
  });

  it('allows automatic deployment only for exact true after successful main CI', () => {
    assert.equal(
      decideStagingDeployment({
        ...base,
        eventName: 'workflow_run',
        workflowConclusion: 'success',
        workflowHeadBranch: 'main',
        autoDeployEnabled: 'true',
      }).deploy,
      true,
    );
    for (const variation of [
      { workflowConclusion: 'failure', workflowHeadBranch: 'main' },
      { workflowConclusion: 'success', workflowHeadBranch: 'feature/unsafe' },
    ]) {
      assert.equal(
        decideStagingDeployment({
          ...base,
          ...variation,
          eventName: 'workflow_run',
          autoDeployEnabled: 'true',
        }).deploy,
        false,
      );
    }
  });

  it('denies unsupported events', () => {
    assert.equal(
      decideStagingDeployment({ ...base, eventName: 'pull_request', autoDeployEnabled: 'true' })
        .deploy,
      false,
    );
  });
});
