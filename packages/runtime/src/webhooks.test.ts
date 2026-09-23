import { describe, expect, it } from "vitest";
import { redeliveryJobId } from "./webhooks.js";

describe("redeliveryJobId", () => {
  it("never contains a colon, which BullMQ rejects in custom ids", () => {
    expect(redeliveryJobId("whd_01m3678b27tzfe55ztn3pryz8q")).not.toContain(":");
  });

  it("differs per redelivery, so finished jobs do not swallow it", () => {
    expect(redeliveryJobId("whd_x", 1)).not.toBe(redeliveryJobId("whd_x", 2));
    expect(redeliveryJobId("whd_x", 1)).not.toBe("whd_x");
  });
});
