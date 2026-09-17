import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { PluckError } from "@pluck/shared";

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6 && address.toLowerCase().startsWith("::ffff:")) {
    const v4 = address.slice(7);
    if (isIP(v4) === 4) return blocked.check(v4, "ipv4");
  }
  return blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

const BLOCKED_HOSTS = /(^|\.)(localhost|local|internal|intranet|lan|home\.arpa)$/i;

/**
 * `net.connect` lookup that refuses to connect to private, loopback or
 * link-local addresses. Checked at connect time, so it also defeats DNS
 * rebinding between validation and connection.
 */
export function createSafeLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    if (!allowPrivate && BLOCKED_HOSTS.test(hostname)) {
      callback(Object.assign(new Error(`Blocked host ${hostname}`), { code: "EPLUCKSSRF" }), "", 4);
      return;
    }
    dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
      if (err) return callback(err, "", 4);
      const allowed = allowPrivate
        ? addresses
        : addresses.filter((a) => !isPrivateAddress(a.address));
      if (allowed.length === 0) {
        callback(
          Object.assign(new Error(`Blocked private address for ${hostname}`), {
            code: "EPLUCKSSRF",
          }),
          "",
          4,
        );
        return;
      }
      if ((options as { all?: boolean }).all) {
        (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, allowed);
      } else {
        const first = allowed[0]!;
        callback(null, first.address, first.family);
      }
    });
  };
}

/** Validates a target URL before any network activity. */
export function assertPublicUrl(raw: string, allowPrivate: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PluckError("bad_request", `Invalid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PluckError("bad_request", "Only http and https URLs are supported.");
  }
  if (url.username || url.password) {
    throw new PluckError("bad_request", "URLs with embedded credentials are not allowed.");
  }
  if (!allowPrivate) {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (BLOCKED_HOSTS.test(host) || isPrivateAddress(host)) {
      throw new PluckError("forbidden", "Private network addresses cannot be scraped.");
    }
  }
  return url;
}
