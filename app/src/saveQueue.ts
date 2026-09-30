export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

type Snapshot<T> = { revision: number; value: T };

export class SaveQueue<T> {
  private latest: Snapshot<T> | null = null;
  private savedRevision = 0;
  private revision = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushPromise: Promise<void> | null = null;
  private readonly write: (value: T) => Promise<void>;
  private readonly onState: (state: SaveState) => void;
  private readonly delay: number;

  constructor(
    write: (value: T) => Promise<void>,
    onState: (state: SaveState) => void,
    delay = 450,
  ) {
    this.write = write;
    this.onState = onState;
    this.delay = delay;
  }

  acknowledgeLoaded(value: T): void {
    this.latest = { revision: ++this.revision, value };
    this.savedRevision = this.revision;
    this.onState('saved');
  }

  schedule(value: T): void {
    if (this.latest?.value === value) return;
    this.latest = { revision: ++this.revision, value };
    this.onState('saving');
    this.clearTimer();
    this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, this.delay);
  }

  flush(): Promise<void> {
    this.clearTimer();
    if (!this.flushPromise) {
      this.flushPromise = this.drain().finally(() => { this.flushPromise = null; });
    }
    return this.flushPromise;
  }

  private async drain(): Promise<void> {
    while (this.latest && this.savedRevision < this.latest.revision) {
      this.clearTimer();
      const target = this.latest;
      try {
        await this.write(target.value);
        this.savedRevision = target.revision;
        if (this.latest?.revision === target.revision) this.onState('saved');
      } catch (error) {
        if (this.latest?.revision === target.revision) {
          this.onState('failed');
          throw error;
        }
      }
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
