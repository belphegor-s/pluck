/**
 * A fixed number of slots shared by interactive and background work.
 *
 * Someone waiting on an HTTP response should not queue behind page 400 of a
 * crawl, so interactive waiters are served first. Background work is not
 * starved either: every `backgroundEvery`-th hand-off goes to the oldest
 * background waiter when one exists.
 *
 * A freed slot is handed straight to the next waiter rather than released and
 * re-acquired, so a caller arriving at the same moment cannot take it and push
 * the count over the limit.
 */
export type SlotPriority = "interactive" | "background";

export class PrioritySlots {
  private active = 0;
  private handoffs = 0;
  private readonly waiting: Record<SlotPriority, (() => void)[]> = {
    interactive: [],
    background: [],
  };

  constructor(
    private readonly limit: number,
    private readonly backgroundEvery = 4,
  ) {}

  /** Resolves once a slot is held; call `release` exactly once afterwards. */
  acquire(priority: SlotPriority = "interactive"): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting[priority].push(resolve));
  }

  release(): void {
    const next = this.next();
    if (next) next();
    else this.active--;
  }

  /** Slots in use, and callers waiting for one. */
  get stats() {
    return {
      active: this.active,
      interactive: this.waiting.interactive.length,
      background: this.waiting.background.length,
    };
  }

  private next(): (() => void) | undefined {
    const { interactive, background } = this.waiting;
    this.handoffs++;
    const backgroundTurn = this.handoffs % this.backgroundEvery === 0;
    if (backgroundTurn && background.length > 0) return background.shift();
    return interactive.shift() ?? background.shift();
  }
}
