import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  EventDraft,
  ManagedUser,
  Recipient,
  Reminder,
  ReminderDraft,
  Role,
  UploadBatch,
  UploadResult,
  UtsavEvent,
} from '../models';

/** Thin typed wrapper around the REST API. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly url = environment.apiUrl;

  // ---- Events ----
  getEvents(from: string, to: string): Observable<UtsavEvent[]> {
    return this.http.get<UtsavEvent[]>(`${this.url}/events`, { params: { from, to } });
  }
  searchEvents(q: string): Observable<UtsavEvent[]> {
    return this.http.get<UtsavEvent[]>(`${this.url}/events/search`, { params: { q } });
  }
  createEvent(draft: EventDraft): Observable<UtsavEvent> {
    return this.http.post<UtsavEvent>(`${this.url}/events`, draft);
  }
  updateEvent(id: number, draft: EventDraft): Observable<UtsavEvent> {
    return this.http.put<UtsavEvent>(`${this.url}/events/${id}`, draft);
  }
  deleteEvent(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/events/${id}`);
  }
  uploadEvents(file: File): Observable<UploadResult> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<UploadResult>(`${this.url}/admin/upload`, body);
  }
  getUploads(): Observable<UploadBatch[]> {
    return this.http.get<UploadBatch[]>(`${this.url}/admin/uploads`);
  }
  deleteUpload(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/admin/uploads/${id}`);
  }

  // ---- Recipients ----
  getRecipients(): Observable<Recipient[]> {
    return this.http.get<Recipient[]>(`${this.url}/recipients`);
  }
  addRecipients(emails: string[]): Observable<Recipient[]> {
    return this.http.post<Recipient[]>(`${this.url}/recipients`, { emails });
  }
  deleteRecipient(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/recipients/${id}`);
  }

  // ---- Reminders (always the signed-in user's own) ----
  getReminders(): Observable<Reminder[]> {
    return this.http.get<Reminder[]>(`${this.url}/reminders`);
  }
  addReminders(eventId: number, reminders: ReminderDraft[]): Observable<Reminder[]> {
    return this.http.post<Reminder[]>(`${this.url}/reminders`, { event_id: eventId, reminders });
  }
  deleteReminder(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/reminders/${id}`);
  }
  deleteReminderDate(eventId: number, date: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/reminders`, {
      params: { event_id: eventId, date },
    });
  }

  // ---- Users (admin only) ----
  getUsers(): Observable<ManagedUser[]> {
    return this.http.get<ManagedUser[]>(`${this.url}/users`);
  }
  createUser(user: {
    username: string;
    password: string;
    full_name: string;
    role: Role;
  }): Observable<ManagedUser> {
    return this.http.post<ManagedUser>(`${this.url}/users`, user);
  }
  updateUser(
    id: number,
    changes: Partial<{
      username: string;
      full_name: string;
      role: Role;
      active: boolean;
      password: string;
    }>,
  ): Observable<ManagedUser> {
    return this.http.put<ManagedUser>(`${this.url}/users/${id}`, changes);
  }
  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/users/${id}`);
  }
}
