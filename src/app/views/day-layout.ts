import { UtsavEvent } from '../models';
import { toMinutes } from '../date-utils';

/** Events have no end time, so the grid draws each one as a block of this length. */
const BLOCK_MINUTES = 60;

export interface PositionedEvent {
  event: UtsavEvent;
  start: number; // minutes since midnight
  lane: number; // 0-based column among overlapping events
  lanes: number; // how many columns the overlapping group needs
}

/**
 * Place a day's timed events on the grid. Events that overlap in time are
 * put side by side instead of on top of each other.
 */
export function layoutDay(events: UtsavEvent[]): PositionedEvent[] {
  const timed = events
    .filter((event) => event.time)
    .map((event) => ({ event, start: toMinutes(event.time as string) }))
    .sort((a, b) => a.start - b.start);

  const result: PositionedEvent[] = [];
  let group: PositionedEvent[] = [];
  let laneEnds: number[] = []; // end time of the last event in each lane
  let groupEnd = -1;

  const closeGroup = () => {
    for (const item of group) item.lanes = laneEnds.length;
    result.push(...group);
    group = [];
    laneEnds = [];
  };

  for (const { event, start } of timed) {
    if (start >= groupEnd) closeGroup(); // no overlap with the previous group

    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = start + BLOCK_MINUTES;

    group.push({ event, start, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, start + BLOCK_MINUTES);
  }
  closeGroup();

  return result;
}
