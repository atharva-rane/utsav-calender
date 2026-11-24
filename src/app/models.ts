export type CalendarView = 'schedule' | 'day' | '3days' | 'week' | 'month';

/** An event as stored by the API. */
export interface UtsavEvent {
  id: number;
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM, or null for all-day
  location: string;
  description: string;
  /** True when an admin published it for everyone; false when it is private to its owner. */
  shared: boolean;
  /** Whether the signed-in user may edit or delete it (shared events are read-only for users). */
  editable: boolean;
}

/** The editable copy shown in the event editor (id is missing for new events). */
export type EventDraft = Omit<UtsavEvent, 'id' | 'time' | 'shared' | 'editable'> & {
  id?: number;
  time: string;
  /** Admins can choose to show a new event to all users; ignored for everyone else. */
  shared?: boolean;
  editable?: boolean;
};

export interface Recipient {
  id: number;
  email: string;
}

/** One reminder email slot (a date + a time) that the signed-in user has set for an event. */
export interface Reminder {
  id: number;
  event_id: number;
  remind_date: string; // YYYY-MM-DD
  remind_time: string; // HH:MM
  status: 'pending' | 'sent' | 'skipped';
}

/** A reminder date with its times, as edited in the event editor. An empty date is ignored. */
export interface ReminderDraft {
  date: string;
  times: string[]; // HH:MM
}

/** All of one user's reminder slots for one date. */
export interface ReminderGroup {
  date: string;
  items: Reminder[];
}

export type Role = 'admin' | 'user';

/** The signed-in person. */
export interface SessionUser {
  id: number;
  username: string;
  full_name: string;
  role: Role;
}

/** A user account as listed in the admin's "Manage users" section. */
export interface ManagedUser extends SessionUser {
  active: boolean;
  created_at: string;
}

/** An event that was not added because the same name already exists on that date. */
export interface UploadDuplicate {
  title: string;
  date: string;
  reason: string;
}

export interface UploadResult {
  imported: number;
  /** Rows that were not valid events (missing title or date, bad time). */
  skipped: number;
  duplicates: UploadDuplicate[];
}

/** One event inside an uploaded file. */
export type UploadedEvent = Pick<
  UtsavEvent,
  'id' | 'title' | 'date' | 'time' | 'location' | 'description'
>;

/** One uploaded Excel file and the events it added. */
export interface UploadBatch {
  id: number;
  filename: string;
  created_at: string;
  uploaded_by: string | null;
  events: UploadedEvent[];
}

/** One calendar day: the Date plus its YYYY-MM-DD key. */
export interface Day {
  date: Date;
  key: string;
}
