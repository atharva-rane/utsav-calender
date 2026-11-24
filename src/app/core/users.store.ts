import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ManagedUser, Role } from '../models';
import { ApiService } from './api.service';

/** The admin's list of accounts. Methods throw on failure so the screen can show the reason. */
@Injectable({ providedIn: 'root' })
export class UsersStore {
  private readonly api = inject(ApiService);

  readonly list = signal<ManagedUser[]>([]);
  readonly loading = signal(false);

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.list.set(await firstValueFrom(this.api.getUsers()));
    } finally {
      this.loading.set(false);
    }
  }

  async create(user: {
    username: string;
    password: string;
    full_name: string;
    role: Role;
  }): Promise<void> {
    await firstValueFrom(this.api.createUser(user));
    await this.load();
  }

  async update(
    id: number,
    changes: Partial<{
      username: string;
      full_name: string;
      role: Role;
      active: boolean;
      password: string;
    }>,
  ): Promise<void> {
    const saved = await firstValueFrom(this.api.updateUser(id, changes));
    this.list.update((users) => users.map((u) => (u.id === id ? saved : u)));
  }

  async remove(id: number): Promise<void> {
    await firstValueFrom(this.api.deleteUser(id));
    this.list.update((users) => users.filter((u) => u.id !== id));
  }
}
