import { describe, expect, it } from "vitest";
import { parseProxyUrl } from "./proxies.js";

describe("proxy URL validation", () => {
  it("accepts the shapes providers hand out", () => {
    for (const url of [
      "http://user:pass@gateway.provider.io:7777",
      "https://gw.example.com:8443",
      "socks5://user-country-{country}:pass@pool.example.net:1080",
    ]) {
      expect(() => parseProxyUrl(url)).not.toThrow();
    }
  });

  it("hides the password but keeps the gateway recognisable", () => {
    const { hint } = parseProxyUrl("http://abcdef:secret@gateway.provider.io:7777");
    expect(hint).toBe("http://abc…@gateway.provider.io:7777");
    expect(hint).not.toContain("secret");
  });

  // A proxy URL is a connection this server makes for someone else, so the
  // usual SSRF targets have to be refused here as well as on scrape targets.
  it.each([
    "http://localhost:8080",
    "http://127.0.0.1:3128",
    "http://169.254.169.254",
    "http://10.0.0.5:8080",
    "http://192.168.1.10:8080",
    "http://172.16.4.2:8080",
    "http://printer.local:3128",
  ])("refuses %s", (url) => {
    expect(() => parseProxyUrl(url)).toThrow(/private or loopback/i);
  });

  it("allows a private proxy only when the instance opts in", () => {
    expect(() => parseProxyUrl("http://10.0.0.5:8080", true)).not.toThrow();
  });

  it("refuses schemes that are not proxies", () => {
    expect(() => parseProxyUrl("ftp://gateway.example.com")).toThrow(/not supported/i);
    expect(() => parseProxyUrl("file:///etc/passwd")).toThrow(/not supported/i);
    expect(() => parseProxyUrl("nonsense")).toThrow(/not a valid proxy URL/i);
  });
});
