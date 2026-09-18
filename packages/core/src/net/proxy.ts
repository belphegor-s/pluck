export type ProxyTier = "datacenter" | "residential";
export type ProxyUsed = "none" | ProxyTier;

export interface ProxyConfig {
  datacenter: string[];
  residential: string[];
}

export interface ResolvedProxy {
  tier: ProxyTier;
  /** Full proxy URL, e.g. http://user:pass@host:port */
  url: string;
}

/**
 * Round-robin proxy pool. Proxy URLs may contain `{country}` and `{session}`
 * placeholders, which most providers use for geo-targeting and sticky sessions:
 *   http://user-country-{country}-session-{session}:pass@gw.provider.io:7777
 */
export class ProxyPool {
  private readonly cursor: Record<ProxyTier, number> = { datacenter: 0, residential: 0 };

  constructor(private readonly config: ProxyConfig) {}

  static fromEnv(env: Readonly<Record<string, unknown>>): ProxyPool {
    const list = (v: unknown) =>
      (typeof v === "string" ? v : "")
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    return new ProxyPool({
      datacenter: list(env.PROXY_DATACENTER_URLS),
      residential: list(env.PROXY_RESIDENTIAL_URLS),
    });
  }

  has(tier: ProxyTier): boolean {
    return this.config[tier].length > 0;
  }

  /** The configured URLs for a tier, for composing one pool from another. */
  urls(tier: ProxyTier): string[] {
    return [...this.config[tier]];
  }

  get tiers(): ProxyTier[] {
    return (["datacenter", "residential"] as const).filter((t) => this.has(t));
  }

  pick(tier: ProxyTier, opts: { country?: string; session?: string } = {}): ResolvedProxy | null {
    const urls = this.config[tier];
    if (urls.length === 0) return null;
    const index = this.cursor[tier]++ % urls.length;
    const url = urls[index]!.replaceAll("{country}", opts.country ?? "us").replaceAll(
      "{session}",
      opts.session ?? Math.random().toString(36).slice(2, 10),
    );
    return { tier, url };
  }

  /**
   * Escalation ladder for a requested mode. `auto` starts direct and only
   * climbs to paid egress when the previous attempt was blocked.
   */
  ladder(mode: "auto" | "none" | ProxyTier): ProxyUsed[] {
    switch (mode) {
      case "none":
        return ["none"];
      case "datacenter":
        return this.has("datacenter") ? ["datacenter"] : ["none"];
      case "residential":
        return this.has("residential")
          ? ["residential"]
          : this.has("datacenter")
            ? ["datacenter"]
            : ["none"];
      default:
        return ["none", ...this.tiers];
    }
  }
}
