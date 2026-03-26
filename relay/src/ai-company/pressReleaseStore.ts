import { randomUUID } from "node:crypto";
import type { PressRelease } from "./types.js";

class PressReleaseStore {
  private releases: PressRelease[] = [];

  add(release: Omit<PressRelease, "id" | "timestamp">): PressRelease {
    const full: PressRelease = {
      ...release,
      id: randomUUID(),
      timestamp: Date.now(),
    };
    this.releases.unshift(full);
    if (this.releases.length > 50) {
      this.releases = this.releases.slice(0, 40);
    }
    return full;
  }

  update(id: string, updates: Partial<PressRelease>): void {
    const release = this.releases.find((r) => r.id === id);
    if (release) Object.assign(release, updates);
  }

  getAll(): PressRelease[] {
    return [...this.releases];
  }

  delete(id: string): void {
    this.releases = this.releases.filter((r) => r.id !== id);
  }

  reset(): void {
    this.releases = [];
  }
}

export const pressReleaseStore = new PressReleaseStore();
