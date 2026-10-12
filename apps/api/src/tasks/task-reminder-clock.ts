/**
 * Time source for Task reminder delivery (R-036 / D-088). One `now()` is read per
 * tick and passed down, so every due, backoff, and outcome timestamp in that tick
 * uses the same UTC instant. Tests inject a fixed clock instead of sleeping.
 */
export interface TaskReminderClock {
  now(): Date;
}

export const TASK_REMINDER_CLOCK = Symbol('TASK_REMINDER_CLOCK');

export const systemTaskReminderClock: TaskReminderClock = {
  now: () => new Date(),
};
