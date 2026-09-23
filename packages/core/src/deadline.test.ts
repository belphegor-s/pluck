import { describe, expect, it } from "vitest";
import { mapConcurrent, throwIfAborted, withDeadline } from "./deadline.js";
import { FallbackSearch, type SearchProvider } from "./search/index.js";

const never = () => new Promise<never>(() => {});
const after = <T>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("withDeadline", () => {
  it("returns the work when it finishes first", async () => {
    await expect(withDeadline(after(5, "done"), 200, () => "late")).resolves.toBe("done");
  });

  it("returns the fallback when the work hangs", async () => {
    const started = Date.now();
    await expect(withDeadline(never(), 50, () => "late")).resolves.toBe("late");
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("does not wait at all on an empty budget", async () => {
    await expect(withDeadline(never(), 0, () => "late")).resolves.toBe("late");
  });
});

describe("throwIfAborted", () => {
  it("raises a timeout once the signal fires", () => {
    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow(/ran out of time/);
  });
});

describe("mapConcurrent", () => {
  it("never runs more than the limit at once, and keeps order", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapConcurrent([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await after(10, null);
      inFlight--;
      return n * 2;
    });
    expect(peak).toBe(3);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });
});

describe("search deadline", () => {
  const provider = (name: string, search: SearchProvider["search"]): SearchProvider => ({
    name,
    search,
  });

  // The production failure: one provider hung on a queued browser render and
  // the chain waited for it for thirteen minutes.
  it("cuts off a provider that never answers and moves to the next", async () => {
    const chain = new FallbackSearch(
      [
        provider("stuck", never),
        provider("fine", async () => [
          {
            url: "https://example.com",
            title: "ok",
            snippet: "",
            publishedAt: null,
            image: null,
            source: null,
          },
        ]),
      ],
      { budgetMs: 1_000, sliceMs: 150 },
    );
    const started = Date.now();
    const hits = await chain.search({ query: "q", limit: 5, category: "web" } as never);
    expect(hits).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("fails within the budget when every provider hangs", async () => {
    const chain = new FallbackSearch([provider("a", never), provider("b", never)], {
      budgetMs: 300,
      sliceMs: 150,
    });
    const started = Date.now();
    await expect(chain.search({ query: "q", limit: 5, category: "web" } as never)).rejects.toThrow(
      /No search provider returned results/,
    );
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
