/**
 * Time source for messaging writes (Issue #179). Message creation, edit-window,
 * withdrawal, and membership timestamps all read it, so tests inject a fixed
 * clock to cross the 15-minute edit window without sleeping.
 */
export interface MessagingClock {
  now(): Date;
}

export const MESSAGING_CLOCK = Symbol('MESSAGING_CLOCK');

export const systemMessagingClock: MessagingClock = {
  now: () => new Date(),
};
