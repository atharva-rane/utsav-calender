import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CalendarStore } from '../core/calendar.store';
import { CalendarView } from '../models';
import { IconComponent, IconName } from '../shared/icon.component';

const VIEWS = [
  { view: 'schedule', label: 'Schedule', icon: 'view_agenda' },
  { view: 'day', label: 'Day', icon: 'view_day' },
  { view: '3days', label: '3 days', icon: 'view_column' },
  { view: 'week', label: 'Week', icon: 'view_week' },
  { view: 'month', label: 'Month', icon: 'apps' },
] as const satisfies readonly { view: CalendarView; label: string; icon: IconName }[];

@Component({
  selector: 'app-drawer',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" [class.show]="store.drawerOpen()" (click)="close()"></div>

    <aside
      class="drawer"
      [class.open]="store.drawerOpen()"
      [attr.aria-hidden]="!store.drawerOpen()"
      [attr.inert]="store.drawerOpen() ? null : ''"
      aria-label="Menu"
    >
      <div class="drawer-head">
        <span class="brand-mark small"><app-icon name="event" /></span>
        <h2 class="drawer-title">Utsav Calendar</h2>
      </div>

      @for (item of views; track item.view) {
        <button
          class="nav"
          [class.active]="store.section() === 'calendar' && store.view() === item.view"
          (click)="chooseView(item.view)"
        >
          <app-icon [name]="item.icon" />
          <span>{{ item.label }}</span>
        </button>
      }

      <hr />
      <button class="nav" (click)="refresh()">
        <app-icon name="refresh" />
        <span>Refresh</span>
      </button>
      <button class="nav" (click)="openPanel('recipients')">
        <app-icon name="mail" />
        <span>Reminder emails</span>
        <span class="count">{{ store.recipients().length }}</span>
      </button>

      @if (store.auth.isAdmin()) {
        <hr />
        <button class="nav" [class.active]="store.section() === 'users'" (click)="openUsers()">
          <app-icon name="group" />
          <span>Manage users</span>
        </button>
        <button class="nav" [class.active]="store.section() === 'uploads'" (click)="openUploads()">
          <app-icon name="upload" />
          <span>Manage uploads</span>
        </button>
      }

      <div class="drawer-foot">
        <button class="account" (click)="openPanel('account')" aria-label="Account">
          <span class="avatar" [class.admin]="store.auth.isAdmin()">{{ store.auth.initial() }}</span>
          <span class="account-text">
            {{ store.auth.name() }}
            <small>{{ store.auth.isAdmin() ? 'Admin' : 'Member' }}</small>
          </span>
        </button>
        <button class="nav" (click)="logout()">
          <app-icon name="logout" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  `,
})
export class DrawerComponent {
  protected readonly store = inject(CalendarStore);
  protected readonly views = VIEWS;

  protected close(): void {
    this.store.drawerOpen.set(false);
  }

  protected chooseView(view: CalendarView): void {
    this.store.section.set('calendar');
    this.store.setView(view);
    this.close();
  }

  protected openUsers(): void {
    this.store.section.set('users');
    this.close();
  }

  protected openUploads(): void {
    this.store.section.set('uploads');
    this.close();
  }

  protected refresh(): void {
    this.store.refresh();
    this.store.say('Refreshing…');
    this.close();
  }

  protected openPanel(panel: 'recipients' | 'account'): void {
    this.close();
    this.store.panel.set(panel);
  }

  protected logout(): void {
    this.close();
    this.store.logout();
  }
}
