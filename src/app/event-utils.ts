import { UtsavEvent } from './models';

/** 'shared' = published by an admin for everyone; 'mine' = private to the signed-in person. */
export type EventKind = 'shared' | 'mine';

export const eventKind = (event: Pick<UtsavEvent, 'shared'>): EventKind =>
  event.shared ? 'shared' : 'mine';
