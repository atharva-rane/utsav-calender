import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalendarStore } from '../core/calendar.store';
import { UsersStore } from '../core/users.store';
import { ManagedUser, Role } from '../models';
import { IconComponent } from '../shared/icon.component';

const PASSWORD_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A readable random password (no look-alike characters such as 0/O or l/1). */
function generatePassword(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (n) => PASSWORD_CHARS[n % PASSWORD_CHARS.length]).join('');
}

interface UserForm {
  full_name: string;
  username: string;
  password: string;
  role: Role;
  active: boolean;
}

/** The admin's own section: add people, set usernames and passwords, turn accounts off. */
@Component({
  selector: 'app-users-admin',
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
          <h1 class="page-title">Manage users</h1>
          <small>Everyone you add here can sign in and set their own reminders.</small>
        </div>
      </header>

      <div class="page-body">
        <!-- ============ Add a user ============ -->
        <form class="card" (ngSubmit)="add()" novalidate>
          <h2 class="card-title"><app-icon name="person_add" /> Add a user</h2>

          <div class="grid-2">
            <label class="stack">
              Name <span class="optional">(optional)</span>
              <input name="new-name" [(ngModel)]="form.full_name" maxlength="100" autocomplete="off" />
            </label>
            <label class="stack">
              Username
              <input
                name="new-username"
                [(ngModel)]="form.username"
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
                maxlength="64"
              />
            </label>
          </div>

          <label class="stack">
            Password (at least 8 characters)
            <span class="with-action">
              <input
                name="new-password"
                [type]="showNew() ? 'text' : 'password'"
                [(ngModel)]="form.password"
                autocomplete="new-password"
              />
              <button
                type="button"
                class="icon-btn small"
                (click)="showNew.set(!showNew())"
                [attr.aria-label]="showNew() ? 'Hide password' : 'Show password'"
              >
                <app-icon [name]="showNew() ? 'visibility_off' : 'visibility'" />
              </button>
            </span>
          </label>
          <button type="button" class="link" (click)="suggest(form)">Suggest a strong password</button>

          <div class="role-pick" role="radiogroup" aria-label="Role">
            <button
              type="button"
              role="radio"
              class="seg"
              [class.on]="form.role === 'user'"
              [attr.aria-checked]="form.role === 'user'"
              (click)="form.role = 'user'"
            >
              Member
              <small>Adds utsavs and sets own reminders</small>
            </button>
            <button
              type="button"
              role="radio"
              class="seg"
              [class.on]="form.role === 'admin'"
              [attr.aria-checked]="form.role === 'admin'"
              (click)="form.role = 'admin'"
            >
              Admin
              <small>Also uploads Excel and manages users</small>
            </button>
          </div>

          @if (error()) {
            <p class="err" role="alert">{{ error() }}</p>
          }
          <button class="btn btn-primary wide" type="submit" [disabled]="busy()">Add user</button>
        </form>

        <!-- ============ All users ============ -->
        <section class="card">
          <h2 class="card-title">
            <app-icon name="group" /> All users
            <span class="count-pill">{{ users.list().length }}</span>
          </h2>

          @for (user of users.list(); track user.id) {
            <div class="u-row" [class.off]="!user.active">
              <span class="avatar" [class.admin]="user.role === 'admin'">
                {{ (user.full_name || user.username).charAt(0).toUpperCase() }}
              </span>
              <div class="u-main">
                <b>{{ user.full_name || user.username }}</b>
                <small>&#64;{{ user.username }}</small>
              </div>
              <span class="badges">
                @if (isMe(user)) {
                  <span class="badge">You</span>
                }
                <span class="badge" [class.badge-admin]="user.role === 'admin'">
                  {{ user.role === 'admin' ? 'Admin' : 'Member' }}
                </span>
                @if (!user.active) {
                  <span class="badge badge-off">Turned off</span>
                }
              </span>
              <button
                class="btn btn-soft small"
                (click)="startEdit(user)"
                [attr.aria-expanded]="editingId() === user.id"
              >
                {{ editingId() === user.id ? 'Close' : 'Edit' }}
              </button>
            </div>

            @if (editingId() === user.id) {
              <div class="u-edit">
                <div class="grid-2">
                  <label class="stack">
                    Name
                    <input name="e-name" [(ngModel)]="edit.full_name" maxlength="100" autocomplete="off" />
                  </label>
                  <label class="stack">
                    Username
                    <input
                      name="e-username"
                      [(ngModel)]="edit.username"
                      autocapitalize="none"
                      spellcheck="false"
                      autocomplete="off"
                    />
                  </label>
                </div>

                @if (!isMe(user)) {
                  <label class="stack">
                    Set a new password <span class="optional">(leave empty to keep the current one)</span>
                    <span class="with-action">
                      <input
                        name="e-password"
                        [type]="showEdit() ? 'text' : 'password'"
                        [(ngModel)]="edit.password"
                        autocomplete="new-password"
                      />
                      <button
                        type="button"
                        class="icon-btn small"
                        (click)="showEdit.set(!showEdit())"
                        [attr.aria-label]="showEdit() ? 'Hide password' : 'Show password'"
                      >
                        <app-icon [name]="showEdit() ? 'visibility_off' : 'visibility'" />
                      </button>
                    </span>
                  </label>
                  <button type="button" class="link" (click)="suggest(edit); showEdit.set(true)">
                    Suggest a strong password
                  </button>
                }

                @if (isMe(user)) {
                  <p class="hint">
                    This is your own account. To change your password use Account → Change
                    password; your role and status cannot be changed here.
                  </p>
                } @else {
                  <div class="role-pick compact" role="radiogroup" aria-label="Role">
                    <button
                      type="button"
                      role="radio"
                      class="seg"
                      [class.on]="edit.role === 'user'"
                      [attr.aria-checked]="edit.role === 'user'"
                      (click)="edit.role = 'user'"
                    >
                      Member
                    </button>
                    <button
                      type="button"
                      role="radio"
                      class="seg"
                      [class.on]="edit.role === 'admin'"
                      [attr.aria-checked]="edit.role === 'admin'"
                      (click)="edit.role = 'admin'"
                    >
                      Admin
                    </button>
                  </div>
                  <label class="field switch-row">
                    <span class="grow">
                      Account active
                      <small>Turned-off users are signed out and cannot sign in.</small>
                    </span>
                    <input type="checkbox" class="switch" name="e-active" [(ngModel)]="edit.active" />
                  </label>
                }

                @if (editError()) {
                  <p class="err" role="alert">{{ editError() }}</p>
                }

                @if (confirmingId() === user.id) {
                  <div class="confirm">
                    <span>Delete {{ user.full_name || user.username }} and their reminders?</span>
                    <button class="btn btn-soft" (click)="confirmingId.set(null)">Cancel</button>
                    <button class="btn btn-danger" (click)="remove(user)">Delete</button>
                  </div>
                } @else {
                  <div class="btn-row spread">
                    @if (!isMe(user)) {
                      <button class="btn btn-soft danger-text" (click)="confirmingId.set(user.id)">
                        <app-icon name="delete" /> Delete
                      </button>
                    } @else {
                      <span></span>
                    }
                    <button class="btn btn-primary" [disabled]="busy()" (click)="saveEdit(user)">
                      Save changes
                    </button>
                  </div>
                }
              </div>
            }
          } @empty {
            <p class="empty-note">{{ users.loading() ? 'Loading…' : 'No users yet.' }}</p>
          }
        </section>
      </div>
    </div>
  `,
})
export class UsersAdminComponent implements OnInit {
  protected readonly users = inject(UsersStore);
  private readonly store = inject(CalendarStore);

  protected form: UserForm = this.blank();
  protected edit: UserForm = this.blank();
  protected readonly showNew = signal(false);
  protected readonly showEdit = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly confirmingId = signal<number | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly editError = signal('');

  ngOnInit(): void {
    this.users.load().catch((error) => this.store.fail(error));
  }

  protected isMe(user: ManagedUser): boolean {
    return user.id === this.store.auth.userId();
  }

  protected back(): void {
    this.store.section.set('calendar');
  }

  protected suggest(target: UserForm): void {
    target.password = generatePassword();
    this.showNew.set(true);
  }

  protected async add(): Promise<void> {
    const { username, password } = this.form;
    if (!username.trim()) return this.error.set('Enter a username.');
    if (password.length < 8) return this.error.set('The password needs at least 8 characters.');

    this.busy.set(true);
    this.error.set('');
    try {
      await this.users.create({
        username: username.trim(),
        password,
        full_name: this.form.full_name.trim(),
        role: this.form.role,
      });
      this.store.say(`${this.form.full_name.trim() || username.trim()} added`);
      this.form = this.blank();
      this.showNew.set(false);
    } catch (error) {
      this.error.set(this.store.errorMessage(error, 'Could not add the user'));
    } finally {
      this.busy.set(false);
    }
  }

  protected startEdit(user: ManagedUser): void {
    if (this.editingId() === user.id) return this.editingId.set(null);
    this.edit = {
      full_name: user.full_name,
      username: user.username,
      password: '',
      role: user.role,
      active: user.active,
    };
    this.editError.set('');
    this.confirmingId.set(null);
    this.showEdit.set(false);
    this.editingId.set(user.id);
  }

  protected async saveEdit(user: ManagedUser): Promise<void> {
    if (this.edit.password && this.edit.password.length < 8) {
      return this.editError.set('The new password needs at least 8 characters.');
    }
    this.busy.set(true);
    this.editError.set('');
    try {
      await this.users.update(user.id, {
        full_name: this.edit.full_name.trim(),
        username: this.edit.username.trim(),
        ...(this.isMe(user) ? {} : { role: this.edit.role, active: this.edit.active }),
        ...(this.edit.password && !this.isMe(user) ? { password: this.edit.password } : {}),
      });
      if (this.isMe(user)) await this.store.auth.restore(); // refresh the name shown in the app
      this.store.say('Changes saved');
      this.editingId.set(null);
    } catch (error) {
      this.editError.set(this.store.errorMessage(error, 'Could not save the changes'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(user: ManagedUser): Promise<void> {
    try {
      await this.users.remove(user.id);
      this.store.say('User deleted');
      this.editingId.set(null);
    } catch (error) {
      this.editError.set(this.store.errorMessage(error, 'Could not delete the user'));
    } finally {
      this.confirmingId.set(null);
    }
  }

  private blank(): UserForm {
    return { full_name: '', username: '', password: '', role: 'user', active: true };
  }
}
