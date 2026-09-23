import { describe, expect, it } from "vitest";
import { PrioritySlots } from "./slots.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("PrioritySlots", () => {
  it("never holds more than the limit, even when a caller arrives during a hand-off", async () => {
    const slots = new PrioritySlots(2);
    await slots.acquire();
    await slots.acquire();
    let third = false;
    void slots.acquire().then(() => {
      third = true;
    });
    slots.release();
    // Arrives in the same tick the freed slot is handed to the waiter.
    let intruder = false;
    void slots.acquire().then(() => {
      intruder = true;
    });
    await tick();
    expect(third).toBe(true);
    expect(intruder).toBe(false);
    expect(slots.stats.active).toBe(2);
  });

  it("serves interactive waiters before background ones", async () => {
    const slots = new PrioritySlots(1, 100);
    await slots.acquire();
    const order: string[] = [];
    void slots.acquire("background").then(() => order.push("crawl page"));
    void slots.acquire("interactive").then(() => order.push("scrape"));
    slots.release();
    await tick();
    slots.release();
    await tick();
    expect(order).toEqual(["scrape", "crawl page"]);
  });

  it("still gives background work a turn under constant interactive load", async () => {
    const slots = new PrioritySlots(1, 3);
    await slots.acquire();
    const order: string[] = [];
    void slots.acquire("background").then(() => order.push("background"));
    for (let i = 0; i < 5; i++)
      void slots.acquire("interactive").then(() => order.push(`interactive ${i}`));
    for (let i = 0; i < 6; i++) {
      slots.release();
      await tick();
    }
    expect(order.indexOf("background")).toBe(2);
    expect(order).toHaveLength(6);
  });

  it("frees the slot when nobody is waiting", async () => {
    const slots = new PrioritySlots(1);
    await slots.acquire();
    slots.release();
    expect(slots.stats.active).toBe(0);
  });
});
