import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CalendarStore } from '../core/calendar.store';
import { IconComponent } from '../shared/icon.component';

const MAX_ITEMS = 8;

/** A centred warning the person has to acknowledge, e.g. "this utsav already exists". */
@Component({
  selector: 'app-alert-dialog',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.alertBox(); as box) {
      <div class="scrim show alert-scrim" (click)="close()"></div>
      <section class="alert-box" role="alertdialog" aria-modal="true" [attr.aria-label]="box.title">
        <span class="alert-icon"><app-icon name="warning" /></span>
        <h2>{{ box.title }}</h2>
        <p>{{ box.message }}</p>
        @if (shown().length) {
          <ul class="alert-list">
            @for (item of shown(); track item) {
              <li>{{ item }}</li>
            }
          </ul>
          @if (more() > 0) {
            <p class="alert-more">and {{ more() }} more</p>
          }
        }
        <button class="btn btn-primary wide" (click)="close()" autofocus>OK</button>
      </section>
    }
  `,
})
export class AlertDialogComponent {
  protected readonly store = inject(CalendarStore);
  protected readonly shown = computed(() => this.store.alertBox()?.items?.slice(0, MAX_ITEMS) ?? []);
  protected readonly more = computed(() => (this.store.alertBox()?.items?.length ?? 0) - MAX_ITEMS);

  protected close(): void {
    this.store.alertBox.set(null);
  }
}
