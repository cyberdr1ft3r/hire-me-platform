import { describe, expect, it } from 'vitest';

import { createRequestSequence } from './request-sequence.js';

describe('request sequence', () => {
  it('lets only the newest request commit once a newer one starts', () => {
    const sequence = createRequestSequence();
    const older = sequence.next();
    const newer = sequence.next();

    expect(older()).toBe(false);
    expect(newer()).toBe(true);
  });

  it('keeps the current request current when it is only observed', () => {
    const sequence = createRequestSequence();
    const started = sequence.next();
    const observed = sequence.current();

    expect(started()).toBe(true);
    expect(observed()).toBe(true);
  });

  it('supersedes every outstanding request when invalidated', () => {
    const sequence = createRequestSequence();
    const started = sequence.next();
    const observed = sequence.current();

    sequence.invalidate();

    expect(started()).toBe(false);
    expect(observed()).toBe(false);
    expect(sequence.current()()).toBe(true);
  });

  it('lets a page result win only for the newest page of the current report', () => {
    const reports = createRequestSequence();
    const pages = createRequestSequence();
    reports.next();

    const firstReport = reports.current();
    const olderPage = pages.next();
    const newerPage = pages.next();
    const olderCommits = () => firstReport() && olderPage();
    const newerCommits = () => firstReport() && newerPage();

    // A newer page request supersedes the older one within the same report.
    expect(olderCommits()).toBe(false);
    expect(newerCommits()).toBe(true);

    // A newer report supersedes every page request made under the old one.
    reports.next();
    expect(newerCommits()).toBe(false);
  });
});
