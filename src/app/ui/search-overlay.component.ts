import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { CalendarStore } from '../core/calendar.store';
import { formatTime, parseYmd } from '../date-utils';
import { UtsavEvent } from '../models';
import { IconComponent } from '../shared/icon.component';

/** Full-screen search by utsav name across all dates. */
@Component({
  selector: 'app-search-overlay',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.searchOpen()) {
      <div class="search" role="search">
        <div class="search-bar">
          <button class="icon-btn" (click)="close()" aria-label="Back">
            <app-icon name="arrow_back" />
          </button>
          <input
            #box
            class="search-input"
            type="search"
            placeholder="Search utsavs"
            [ngModel]="query()"
            (ngModelChange)="query.set($event)"
            autocomplete="off"
            enterkeyhint="search"
          />
          @if (query()) {
            <button class="icon-btn" (click)="query.set('')" aria-label="Clear">
              <app-icon name="close" />
            </button>
          }
        </div>

        <div class="search-results">
          @for (event of results(); track event.id) {
            <button [class]="'result kind-' + (event.shared ? 'shared' : 'mine')" (click)="store.showSearchResult(event)">
              <span class="result-date">
                <small>{{ month(event) }}</small>
                <b>{{ day(event) }}</b>
              </span>
              <span class="result-main">
                {{ event.title }}
                <small>{{ details(event) }}</small>
              </span>
            </button>
          } @empty {
            @if (busy()) {
              <p class="empty">Searching…</p>
            } @else if (query().trim()) {
              <p class="empty">No utsavs found</p>
            } @else {
              <p class="empty">Type the name of an utsav</p>
            }
          }
        </div>
      </div>
    }
  `,
})
export class SearchOverlayComponent {
  protected readonly store = inject(CalendarStore);
  protected readonly query = signal('');
  protected readonly busy = signal(false);
  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');

  /** Debounced server search; each new keystroke cancels the previous request. */
  protected readonly results = toSignal(
    toObservable(this.query).pipe(
      map((text) => text.trim()),
      debounceTime(200),
      distinctUntilChanged(),
      tap((text) => this.busy.set(!!text)),
      switchMap((text) =>
        text
          ? this.store.search(text).pipe(catchError(() => of([] as UtsavEvent[])))
          : of([] as UtsavEvent[]),
      ),
      tap(() => this.busy.set(false)),
    ),
    { initialValue: [] as UtsavEvent[] },
  );

  constructor() {
    // Each time search opens: clear the old text and focus the field.
    effect(() => {
      if (!this.store.searchOpen()) return;
      untracked(() => this.query.set(''));
      setTimeout(() => this.box()?.nativeElement.focus(), 50);
    });
  }

  protected close(): void {
    this.store.searchOpen.set(false);
  }

  protected month = (e: UtsavEvent) =>
    parseYmd(e.date).toLocaleDateString('en', { month: 'short', year: 'numeric' });
  protected day = (e: UtsavEvent) => parseYmd(e.date).getDate();
  protected details = (e: UtsavEvent) =>
    [
      parseYmd(e.date).toLocaleDateString('en', { weekday: 'short' }),
      formatTime(e.time) || 'All day',
      e.location,
    ]
      .filter(Boolean)
      .join(' · ');
}
