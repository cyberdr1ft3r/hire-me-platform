import { describe, expect, it } from 'vitest';

import { DocumentRequestError } from '../api.js';
import { installBlobArrayBuffer } from '../public-opportunities/public-opportunity-test-data.js';
import { resolveDocumentAccess } from './document-access.js';
import { fileSizeParts, friendlyFormat } from './document-labels.js';
import {
  attachTargetsFor,
  documentFailureKey,
  EMPTY_DOCUMENT_FILTERS,
  EMPTY_REGISTER_VALUES,
  hasActiveDocumentFilters,
  registerProblem,
  toCreateRequest,
  toListParameters,
} from './document-state.js';
import {
  CLIENT_ID,
  FULL_ACCESS,
  INTERVIEW_ID,
  MISSION_ID,
  option,
  PROCESS_ID,
} from './document-test-data.js';

installBlobArrayBuffer();

describe('document access', () => {
  it('derives every capability from the permission the API re-checks', () => {
    const full = resolveDocumentAccess(FULL_ACCESS);
    expect(full).toMatchObject({
      canArchive: true,
      canCreate: true,
      canDownload: true,
      canUpdate: true,
      canAddVersion: true,
      canSeeArchived: true,
      pickClients: true,
      pickCandidates: true,
      pickMissions: true,
      pickProcesses: true,
      pickInterviews: true,
      readOnly: false,
    });
    expect(resolveDocumentAccess(['documents:view'])).toMatchObject({
      canCreate: false,
      canDownload: false,
      canSeeArchived: false,
      pickClients: false,
      pickMissions: false,
      readOnly: true,
    });
  });

  it('never offers process or interview pickers without their parent scope', () => {
    expect(
      resolveDocumentAccess(['documents:view', 'mission_candidates:view', 'interviews:view']),
    ).toMatchObject({ pickMissions: false, pickProcesses: false, pickInterviews: false });
    expect(
      resolveDocumentAccess(['documents:view', 'missions:view', 'interviews:view']),
    ).toMatchObject({ pickMissions: true, pickProcesses: false, pickInterviews: false });
  });
});

describe('attach targets', () => {
  const access = resolveDocumentAccess(FULL_ACCESS);

  it('offers every permitted target for ordinary types', () => {
    expect(attachTargetsFor('OTHER', access)).toEqual([
      'UNLINKED',
      'CLIENT',
      'CANDIDATE',
      'MISSION',
      'PROCESS',
      'INTERVIEW',
    ]);
  });

  it('mirrors the API rules for recruitment and training contracts', () => {
    expect(attachTargetsFor('CONTRAT_RECRUTEMENT', access)).toEqual(['MISSION']);
    expect(attachTargetsFor('CONTRAT_FORMATION', access)).toEqual([
      'UNLINKED',
      'CLIENT',
      'CANDIDATE',
    ]);
    expect(
      attachTargetsFor('CONTRAT_RECRUTEMENT', resolveDocumentAccess(['documents:create'])),
    ).toEqual([]);
  });

  it('requires a chosen record for every linked target', () => {
    expect(registerProblem({ ...EMPTY_REGISTER_VALUES, title: 'x' }, access)).toBeNull();
    expect(
      registerProblem({ ...EMPTY_REGISTER_VALUES, title: 'x', target: 'CLIENT' }, access),
    ).toBe('documents.register.selectionRequired');
    expect(
      registerProblem(
        { ...EMPTY_REGISTER_VALUES, documentType: 'CONTRAT_RECRUTEMENT', target: 'CLIENT' },
        access,
      ),
    ).toBe('documents.register.recruitmentContractNeedsMission');
    expect(
      registerProblem(
        { ...EMPTY_REGISTER_VALUES, documentType: 'CONTRAT_FORMATION', target: 'MISSION' },
        access,
      ),
    ).toBe('documents.register.trainingContractLimits');
  });
});

describe('create request', () => {
  it('links only the leaf record chosen and never sends an owner', async () => {
    const request = await toCreateRequest({
      ...EMPTY_REGISTER_VALUES,
      title: '  Synthetic notes  ',
      documentType: 'INTERVIEW_REPORT',
      target: 'INTERVIEW',
      process: option(PROCESS_ID, 'Synthetic Candidate'),
      interview: option(INTERVIEW_ID, 'Synthetic Candidate'),
    });
    expect(request).toEqual({
      title: 'Synthetic notes',
      documentType: 'INTERVIEW_REPORT',
      visibility: 'INTERNAL_ONLY',
      context: { interviewId: INTERVIEW_ID },
      version: undefined,
    });
    expect(request).not.toHaveProperty('ownerUserId');
  });

  it('encodes the first file as a version input', async () => {
    const file = new File(['%PDF-1.7'], 'synthetic.pdf', { type: 'application/pdf' });
    const request = await toCreateRequest({
      ...EMPTY_REGISTER_VALUES,
      title: 'File',
      target: 'MISSION',
      mission: option(MISSION_ID, 'Synthetic Mission'),
      file,
    });
    expect(request.context).toEqual({ recruitmentMissionId: MISSION_ID });
    expect(request.version).toEqual({
      filename: 'synthetic.pdf',
      contentType: 'application/pdf',
      base64Content: btoa('%PDF-1.7'),
    });
  });
});

describe('list parameters', () => {
  it('sends only picker-chosen IDs and the current lifecycle by default', () => {
    expect(hasActiveDocumentFilters(EMPTY_DOCUMENT_FILTERS)).toBe(false);
    expect(toListParameters(EMPTY_DOCUMENT_FILTERS)).toEqual({
      search: undefined,
      documentType: undefined,
      status: undefined,
      source: undefined,
      lifecycle: 'current',
      clientId: undefined,
      candidateId: undefined,
      recruitmentMissionId: undefined,
    });
    const filters = {
      ...EMPTY_DOCUMENT_FILTERS,
      search: '  brief ',
      lifecycle: 'all' as const,
      client: option(CLIENT_ID, 'Synthetic Client'),
    };
    expect(hasActiveDocumentFilters(filters)).toBe(true);
    expect(toListParameters(filters)).toMatchObject({
      search: 'brief',
      lifecycle: undefined,
      clientId: CLIENT_ID,
    });
  });
});

describe('failure messages', () => {
  it('maps stable API codes to localized copy and never uses server text', () => {
    const cases: [DocumentRequestError, string][] = [
      [new DocumentRequestError(413, 'DOCUMENT_FILE_SIZE_REJECTED'), 'fileTooLarge'],
      [new DocumentRequestError(400, 'DOCUMENT_FILE_SIGNATURE_REJECTED'), 'fileRejected'],
      [new DocumentRequestError(409, 'DOCUMENT_CONTEXT_MISMATCH'), 'contextMismatch'],
      [new DocumentRequestError(409, 'DOCUMENT_INTERVIEW_CONTEXT_INVALID'), 'contextInvalid'],
      [new DocumentRequestError(409, 'DOCUMENT_ARCHIVED'), 'archived'],
      [new DocumentRequestError(404, 'DOCUMENT_NOT_FOUND'), 'notFound'],
      [new DocumentRequestError(403, 'DOCUMENT_MISSION_SCOPE_REQUIRED'), 'scope'],
    ];
    for (const [error, key] of cases) {
      expect(documentFailureKey(error, 'register')).toBe(`documents.feedback.failure.${key}`);
    }
    expect(documentFailureKey(new Error('network'), 'update')).toBe(
      'documents.feedback.failure.update',
    );
    expect(
      documentFailureKey(
        new DocumentRequestError(400, 'DOCUMENT_RECRUITMENT_CONTRACT_CONTEXT_REQUIRED'),
        'register',
      ),
    ).toBe('documents.register.recruitmentContractNeedsMission');
  });
});

describe('file presentation', () => {
  it('uses decimal units consistent with the 4 MB limit', () => {
    expect(fileSizeParts(512)).toEqual({ unit: 'bytes', value: 512 });
    expect(fileSizeParts(2048)).toEqual({ unit: 'kilobytes', value: 2 });
    expect(fileSizeParts(4_000_000)).toEqual({ unit: 'megabytes', value: 4 });
    expect(friendlyFormat('application/pdf')).toBe('PDF');
    expect(friendlyFormat('application/x-unknown')).toBe('application/x-unknown');
  });
});
