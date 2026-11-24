import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { CalendarStore } from './core/calendar.store';
import { IconComponent } from './shared/icon.component';
import { AccountDialogComponent } from './ui/account-dialog.component';
import { AlertDialogComponent } from './ui/alert-dialog.component';
import { DatePickerComponent } from './ui/date-picker.component';
import { DaySheetComponent } from './ui/day-sheet.component';
import { DrawerComponent } from './ui/drawer.component';
import { EventDetailComponent } from './ui/event-detail.component';
import { EventEditorComponent } from './ui/event-editor.component';
import { LoginComponent } from './ui/login.component';
import { ReminderEmailsComponent } from './ui/reminder-emails.component';
import { SearchOverlayComponent } from './ui/search-overlay.component';
import { UploadsAdminComponent } from './ui/uploads-admin.component';
import { UsersAdminComponent } from './ui/users-admin.component';
import { MonthViewComponent } from './views/month-view.component';
import { ScheduleViewComponent } from './views/schedule-view.component';
import { TimeGridViewComponent } from './views/time-grid-view.component';

// A swipe changes the page when dragged past a quarter of the width, or flicked quickly.
const SWIPE_DISTANCE_RATIO = 0.22;
const SWIPE_FLICK_MIN_PX = 40;
const SWIPE_FLICK_SPEED = 0.5; // px per ms
const SLIDE_OUT_MS = 150;
const SLIDE_IN_MS = 230;

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IconComponent,
    LoginComponent,
    DrawerComponent,
    DatePickerComponent,
    MonthViewComponent,
    ScheduleViewComponent,
    TimeGridViewComponent,
    DaySheetComponent,
    EventDetailComponent,
    EventEditorComponent,
    ReminderEmailsComponent,
    AccountDialogComponent,
    SearchOverlayComponent,
    UsersAdminComponent,
    UploadsAdminComponent,
    AlertDialogComponent,
  ],
  template: `
    @if (store.auth.checking()) {
      <div class="splash" role="status">
        <span class="brand-mark"><app-icon name="event" /></span>
        <p>Opening Utsav Calendar…</p>
      </div>
    } @else if (!store.auth.user()) {
      <app-login />
    } @else {
      @if (store.section() === 'calendar') {
        <header class="appbar">
          <button class="icon-btn" (click)="store.drawerOpen.set(true)" aria-label="Open menu">
            <app-icon name="menu" />
          </button>

          @if (store.view() !== 'schedule') {
            <button class="icon-btn nav-arrow" (click)="store.move(-1)" aria-label="Previous">
              <app-icon name="chevron_left" />
            </button>
            <button class="icon-btn nav-arrow" (click)="store.move(1)" aria-label="Next">
              <app-icon name="chevron_right" />
            </button>
          }

          <button class="title-btn" (click)="store.panel.set('picker')" aria-label="Choose a date">
            <span>{{ store.title() }}</span>
            <span class="yr">{{ store.titleYear() }}</span>
            <app-icon name="arrow_drop_down" />
          </button>

          <span class="spacer"></span>

          <button class="icon-btn" (click)="store.searchOpen.set(true)" aria-label="Search utsavs">
            <app-icon name="search" />
          </button>
          <button class="icon-btn today-btn" (click)="store.goToday()" aria-label="Go to today">
            <span>{{ store.now().getDate() }}</span>
          </button>
          <button
            class="avatar"
            [class.admin]="store.auth.isAdmin()"
            (click)="store.panel.set('account')"
            [attr.aria-label]="'Account: ' + store.auth.name()"
          >
            {{ store.auth.initial() }}
          </button>
        </header>
      }

      <main class="stage" #stage>
        @if (store.loading()) {
          <div class="progress"></div>
        }
        <div class="pane" #pane>
          @if (store.section() === 'users' && store.auth.isAdmin()) {
            <app-users-admin />
          } @else if (store.section() === 'uploads' && store.auth.isAdmin()) {
            <app-uploads-admin />
          } @else {
            @switch (store.view()) {
              @case ('month') {
                <app-month-view />
              }
              @case ('schedule') {
                <app-schedule-view />
              }
              @default {
                <app-time-grid-view />
              }
            }
          }
        </div>
      </main>

      @if (store.section() === 'calendar') {
        <button class="fab" (click)="store.openNew()" aria-label="Create utsav">
          <app-icon name="add" />
          <span class="fab-label">New utsav</span>
        </button>
      }

      <app-drawer />
      <app-date-picker />
      <app-day-sheet />
      <app-event-detail />
      <app-event-editor />
      <app-reminder-emails />
      <app-account-dialog />
      <app-search-overlay />
      <app-alert-dialog />
    }

    @if (store.toast()) {
      <div class="toast" role="status">{{ store.toast() }}</div>
    }
  `,
})
export class AppComponent implements OnInit {
  protected readonly store = inject(CalendarStore);
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private readonly pane = viewChild<ElementRef<HTMLElement>>('pane');
  private readonly swipeBound = new WeakSet<HTMLElement>();

  constructor() {
    // The stage only exists while someone is signed in, so attach swipe handling when it appears.
    effect(() => {
      const el = this.stage()?.nativeElement;
      if (el && !this.swipeBound.has(el)) {
        this.swipeBound.add(el);
        this.bindSwipe(el);
      }
    });
  }

  ngOnInit(): void {
    // Confirm (and renew) a saved session so people stay signed in until they log out.
    void this.store.auth.restore();
  }

  /** Month, day, 3-day and week views page sideways; the schedule scrolls and the rest do not. */
  private canPage(): boolean {
    return (
      this.store.section() === 'calendar' &&
      this.store.view() !== 'schedule' &&
      !this.store.drawerOpen() &&
      !this.store.searchOpen() &&
      !this.store.panel() &&
      !this.store.draft() &&
      !this.store.selected() &&
      !this.store.daySheet()
    );
  }

  /**
   * Google Calendar style paging: the page follows your finger, then slides away and the next
   * (or previous) month slides in from the other side.
   */
  private bindSwipe(stage: HTMLElement): void {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let tracking = false;
    let axis: 'x' | 'y' | null = null;
    let dx = 0;

    const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pane = () => this.pane()?.nativeElement;

    stage.addEventListener(
      'touchstart',
      (e) => {
        tracking = this.canPage() && e.touches.length === 1;
        if (!tracking) return;
        [startX, startY, startTime] = [e.touches[0].clientX, e.touches[0].clientY, Date.now()];
        axis = null;
        dx = 0;
      },
      { passive: true },
    );

    stage.addEventListener(
      'touchmove',
      (e) => {
        const el = pane();
        if (!tracking || !el) return;
        const x = e.touches[0].clientX - startX;
        const y = e.touches[0].clientY - startY;
        if (!axis && (Math.abs(x) > 8 || Math.abs(y) > 8)) {
          axis = Math.abs(x) > Math.abs(y) * 1.2 ? 'x' : 'y';
        }
        if (axis !== 'x') return;
        dx = x;
        const fade = 1 - Math.min(Math.abs(dx) / el.clientWidth, 1) * 0.5;
        el.style.transform = `translateX(${dx}px)`;
        el.style.opacity = String(fade);
      },
      { passive: true },
    );

    const finish = () => {
      const el = pane();
      if (!tracking || !el) return;
      tracking = false;
      if (axis !== 'x') return;

      const elapsed = Math.max(Date.now() - startTime, 1);
      const far = Math.abs(dx) > el.clientWidth * SWIPE_DISTANCE_RATIO;
      const flick = Math.abs(dx) > SWIPE_FLICK_MIN_PX && Math.abs(dx) / elapsed > SWIPE_FLICK_SPEED;

      if (!far && !flick) return this.springBack(el, dx, reduceMotion());
      this.slidePage(el, dx < 0 ? 1 : -1, dx, reduceMotion());
    };
    stage.addEventListener('touchend', finish, { passive: true });
    stage.addEventListener('touchcancel', finish, { passive: true });
  }

  private springBack(el: HTMLElement, dx: number, instant: boolean): void {
    const from = { transform: `translateX(${dx}px)`, opacity: el.style.opacity || '1' };
    el.style.transform = '';
    el.style.opacity = '';
    if (!instant) {
      el.animate([from, { transform: 'none', opacity: '1' }], { duration: 180, easing: 'ease-out' });
    }
  }

  private slidePage(el: HTMLElement, step: 1 | -1, dx: number, instant: boolean): void {
    const go = () => {
      this.store.move(step);
      el.style.transform = '';
      el.style.opacity = '';
    };
    if (instant) return go();

    const out = el.animate(
      [
        { transform: `translateX(${dx}px)`, opacity: el.style.opacity || '1' },
        { transform: `translateX(${-step * 100}%)`, opacity: 0 },
      ],
      { duration: SLIDE_OUT_MS, easing: 'ease-in', fill: 'forwards' },
    );
    out.onfinish = () => {
      go();
      // Wait for the new month to render, then slide it in from the opposite side.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          out.cancel();
          el.animate(
            [
              { transform: `translateX(${step * 40}%)`, opacity: 0 },
              { transform: 'none', opacity: 1 },
            ],
            { duration: SLIDE_IN_MS, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
          );
        }),
      );
    };
  }

  @HostListener('document:keydown.arrowleft', ['$event'])
  @HostListener('document:keydown.arrowright', ['$event'])
  protected onArrow(event: Event): void {
    const target = event.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || !this.canPage()) return;
    this.store.move((event as KeyboardEvent).key === 'ArrowRight' ? 1 : -1);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.store.closeTopOverlay();
  }
}
