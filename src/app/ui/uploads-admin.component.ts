import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalendarStore } from '../core/calendar.store';
import { UploadsStore } from '../core/uploads.store';
import { formatTime, parseYmd } from '../date-utils';
import { UploadBatch, UploadResult, UploadedEvent } from '../models';
import { IconComponent } from '../shared/icon.component';

interface RowForm {
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
}

/**
 * The admin's "Manage uploads" section: upload an Excel file, see every file with the events it
 * added, edit or delete single rows, or delete a whole file. Uploaded events are shown to all
 * users. The same name on the same date is never added twice.
 */
@Component({
  selector: 'app-uploads-admin',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-bar">
        <button class="icon-btn" (click)="back()" aria-label="Back to calendar">
          <app-icon name="arrow_back" />
        </button>
        <div>
          <h1 class="page-title">Manage uploads</h1>
          <small>Excel schedules you upload are shown to every user.</small>
        </div>
      </header>

      <div class="page-body">
        <!-- ============ Upload ============ -->
        <section class="card">
          <h2 class="card-title"><app-icon name="upload" /> Upload an Excel file</h2>
          <p class="hint">
            Columns: <b>title, date</b> (YYYY-MM-DD), <b>time, description, location</b>. If an utsav
            with the same name already exists on the same date it is not added again, and you are
            told which ones.
          </p>
          <label class="btn btn-primary wide upload-btn" [class.is-busy]="uploads.uploading()">
            <app-icon name="upload" />
            {{ uploads.uploading() ? 'Uploading…' : 'Choose Excel file' }}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              [disabled]="uploads.uploading()"
              (change)="onFile($event)"
            />
          </label>
        </section>

        <!-- ============ Uploaded files ============ -->
        <h2 class="section-title">
          Uploaded files <span class="count-pill">{{ uploads.batches().length }}</span>
        </h2>

        @for (batch of uploads.batches(); track batch.id) {
          <article class="card batch">
            <div class="batch-head">
              <button
                class="batch-toggle"
                (click)="toggle(batch.id)"
                [attr.aria-expanded]="isOpen(batch.id)"
              >
                <span class="file-ico"><app-icon name="notes" /></span>
                <span class="batch-title">
                  <b>{{ batch.filename }}</b>
                  <small>
                    {{ batch.events.length }} {{ batch.events.length === 1 ? 'utsav' : 'utsavs' }} ·
                    uploaded {{ uploaded(batch) }}
                  </small>
                </span>
                <app-icon name="expand_more" [class.flip]="!isOpen(batch.id)" />
              </button>
            </div>

            @if (confirmBatch() === batch.id) {
              <div class="confirm">
                <span>
                  Delete “{{ batch.filename }}” and its {{ batch.events.length }} utsavs from
                  everyone's calendar?
                </span>
                <button class="btn btn-soft" (click)="confirmBatch.set(null)">Cancel</button>
                <button class="btn btn-danger" (click)="removeBatch(batch)">Delete Excel</button>
              </div>
            } @else {
              <div class="batch-tools">
                <button class="btn btn-soft danger-text small" (click)="confirmBatch.set(batch.id)">
                  <app-icon name="delete" /> Delete Excel
                </button>
              </div>
            }

            @if (isOpen(batch.id)) {
              <div class="up-list">
                @for (event of batch.events; track event.id) {
                  @if (editingId() === event.id) {
                    <div class="up-edit">
                      <label class="stack">
                        Title
                        <input name="t{{ event.id }}" [(ngModel)]="form.title" maxlength="200" />
                      </label>
                      <div class="grid-2">
                        <label class="stack">
                          Date
                          <input type="date" name="d{{ event.id }}" [(ngModel)]="form.date" />
                        </label>
                        <label class="stack">
                          Time <span class="optional">(empty = all day)</span>
                          <input type="time" name="h{{ event.id }}" [(ngModel)]="form.time" />
                        </label>
                      </div>
                      <label class="stack">
                        Location
                        <input name="l{{ event.id }}" [(ngModel)]="form.location" />
                      </label>
                      <label class="stack">
                        Description
                        <input name="n{{ event.id }}" [(ngModel)]="form.description" />
                      </label>
                      @if (editError()) {
                        <p class="err" role="alert">{{ editError() }}</p>
                      }
                      <div class="btn-row">
                        <button class="btn btn-soft" (click)="editingId.set(null)">Cancel</button>
                        <button class="btn btn-primary" [disabled]="busy()" (click)="saveRow(event)">
                          Save
                        </button>
                      </div>
                    </div>
                  } @else {
                    <div class="up-row">
                      <div class="up-date">
                        <b>{{ day(event.date) }}</b>
                        <small>{{ month(event.date) }}</small>
                      </div>
                      <div class="up-main">
                        <b>{{ event.title }}</b>
                        <small>{{ details(event) }}</small>
                      </div>

                      @if (confirmRow() === event.id) {
                        <div class="up-confirm">
                          <span>Delete this utsav?</span>
                          <button class="btn btn-soft small" (click)="confirmRow.set(null)">No</button>
                          <button class="btn btn-danger small" (click)="removeRow(event)">Delete</button>
                        </div>
                      } @else {
                        <div class="up-actions">
                          <button class="btn btn-soft small" (click)="startEdit(event)">
                            <app-icon name="edit" /> Edit
                          </button>
                          <button
                            class="btn btn-soft danger-text small"
                            (click)="confirmRow.set(event.id)"
                          >
                            <app-icon name="delete" /> Delete
                          </button>
                        </div>
                      }
                    </div>
                  }
                } @empty {
                  <p class="empty-note slim">All utsavs of this file were removed.</p>
                }
              </div>
            }
          </article>
        } @empty {
          <p class="empty-note">
            {{ uploads.loading() ? 'Loading…' : 'No Excel files uploaded yet.' }}
          </p>
        }
      </div>
    </div>
  `,
})
export class UploadsAdminComponent implements OnInit {
  protected readonly uploads = inject(UploadsStore);
  private readonly store = inject(CalendarStore);

  protected form: RowForm = this.blank();
  protected readonly open = signal<Set<number>>(new Set());
  protected readonly editingId = signal<number | null>(null);
  protected readonly confirmRow = signal<number | null>(null);
  protected readonly confirmBatch = signal<number | null>(null);
  protected readonly busy = signal(false);
  protected readonly editError = signal('');

  async ngOnInit(): Promise<void> {
    try {
      await this.uploads.load();
      const newest = this.uploads.batches()[0];
      if (newest) this.open.set(new Set([newest.id]));
    } catch (error) {
      this.store.fail(error);
    }
  }

  protected back(): void {
    this.store.section.set('calendar');
  }

  // ---------- upload ----------

  protected async onFile(domEvent: Event): Promise<void> {
    const input = domEvent.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow choosing the same file again
    if (!file) return;

    try {
      const result = await this.uploads.upload(file);
      const newest = this.uploads.batches()[0];
      if (result.imported && newest) this.open.update((set) => new Set(set).add(newest.id));
      this.report(result);
    } catch (error) {
      this.store.fail(error);
    }
  }

  /** Tell the admin what was added, and warn about anything that already existed. */
  private report(result: UploadResult): void {
    const extra = result.skipped ? ` ${result.skipped} rows were not valid and were ignored.` : '';

    if (!result.duplicates.length) {
      this.store.say(`${result.imported} ${result.imported === 1 ? 'utsav' : 'utsavs'} added`);
      if (extra) this.store.alert('Some rows were ignored', extra.trim());
      return;
    }

    const items = result.duplicates.map(
      (d) => `${d.title} · ${this.prettyDate(d.date)} (${d.reason.toLowerCase()})`,
    );
    const count = result.duplicates.length;
    this.store.alert(
      result.imported ? 'Some utsavs already exist' : 'Nothing was added',
      (result.imported
        ? `${result.imported} added. ${count} skipped because the same name already exists on that date.`
        : `All ${count} utsavs in this file already exist (same name on the same date).`) + extra,
      items,
    );
  }

  // ---------- list ----------

  protected isOpen(id: number): boolean {
    return this.open().has(id);
  }

  protected toggle(id: number): void {
    this.open.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected uploaded(batch: UploadBatch): string {
    const when = new Date(batch.created_at).toLocaleDateString('en', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return batch.uploaded_by ? `${when} by ${batch.uploaded_by}` : when;
  }

  protected day = (key: string) => parseYmd(key).getDate();
  protected month = (key: string) =>
    parseYmd(key).toLocaleDateString('en', { month: 'short' });
  protected prettyDate = (key: string) =>
    parseYmd(key).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });

  protected details(event: UploadedEvent): string {
    const weekday = parseYmd(event.date).toLocaleDateString('en', { weekday: 'short' });
    return [weekday, event.time ? formatTime(event.time) : 'All day', event.location]
      .filter(Boolean)
      .join(' · ');
  }

  // ---------- edit / delete a row ----------

  protected startEdit(event: UploadedEvent): void {
    this.form = {
      title: event.title,
      date: event.date,
      time: event.time ?? '',
      location: event.location ?? '',
      description: event.description ?? '',
    };
    this.editError.set('');
    this.confirmRow.set(null);
    this.editingId.set(event.id);
  }

  protected async saveRow(event: UploadedEvent): Promise<void> {
    if (!this.form.title.trim()) return this.editError.set('Add a title.');
    if (!this.form.date) return this.editError.set('Pick a date.');

    this.busy.set(true);
    this.editError.set('');
    try {
      await this.uploads.updateEvent(event.id, {
        ...this.form,
        title: this.form.title.trim(),
      });
      this.editingId.set(null);
      this.store.say('Utsav updated');
    } catch (error) {
      this.store.fail(error); // a clash shows the "already exists" alert
    } finally {
      this.busy.set(false);
    }
  }

  protected async removeRow(event: UploadedEvent): Promise<void> {
    this.confirmRow.set(null);
    try {
      await this.uploads.removeEvent(event.id);
      this.store.say('Utsav deleted');
    } catch (error) {
      this.store.fail(error);
    }
  }

  protected async removeBatch(batch: UploadBatch): Promise<void> {
    this.confirmBatch.set(null);
    try {
      await this.uploads.removeBatch(batch.id);
      this.store.say(`“${batch.filename}” deleted`);
    } catch (error) {
      this.store.fail(error);
    }
  }

  private blank(): RowForm {
    return { title: '', date: '', time: '', location: '', description: '' };
  }
}
