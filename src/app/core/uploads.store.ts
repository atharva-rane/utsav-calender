import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EventDraft, UploadBatch, UploadResult, UploadedEvent } from '../models';
import { ApiService } from './api.service';
import { CalendarStore } from './calendar.store';

/**
 * The admin's uploaded Excel files and their events. Anything changed here is also refreshed in
 * the calendar, so what the admin sees in "Manage uploads" and on the calendar always match.
 */
@Injectable({ providedIn: 'root' })
export class UploadsStore {
  private readonly api = inject(ApiService);
  private readonly calendar = inject(CalendarStore);

  readonly batches = signal<UploadBatch[]>([]);
  readonly loading = signal(false);
  readonly uploading = signal(false);

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.batches.set(await firstValueFrom(this.api.getUploads()));
    } finally {
      this.loading.set(false);
    }
  }

  /** Upload a file. Duplicates (same date and name) are skipped and reported in the result. */
  async upload(file: File): Promise<UploadResult> {
    this.uploading.set(true);
    try {
      const result = await firstValueFrom(this.api.uploadEvents(file));
      await this.load();
      if (result.imported) this.calendar.refresh();
      return result;
    } finally {
      this.uploading.set(false);
    }
  }

  /** Delete the whole file and every event it added. */
  async removeBatch(id: number): Promise<void> {
    await firstValueFrom(this.api.deleteUpload(id));
    this.batches.update((list) => list.filter((batch) => batch.id !== id));
    this.calendar.refresh();
  }

  async updateEvent(id: number, draft: EventDraft): Promise<void> {
    const saved = await firstValueFrom(this.api.updateEvent(id, draft));
    const next: UploadedEvent = {
      id: saved.id,
      title: saved.title,
      date: saved.date,
      time: saved.time,
      location: saved.location,
      description: saved.description,
    };
    this.batches.update((list) =>
      list.map((batch) => ({
        ...batch,
        events: batch.events
          .map((event) => (event.id === id ? next : event))
          .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')),
      })),
    );
    this.calendar.refresh();
  }

  async removeEvent(id: number): Promise<void> {
    await firstValueFrom(this.api.deleteEvent(id));
    this.batches.update((list) =>
      list.map((batch) => ({ ...batch, events: batch.events.filter((event) => event.id !== id) })),
    );
    this.calendar.refresh();
  }
}
