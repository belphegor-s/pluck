/**
 * A stand-in for the browser's extension APIs and for the Pluck API, so the
 * real panel and settings bundles from `dist/` can run in an ordinary page.
 *
 * It exists for two things: rendering the store screenshots (`pnpm store`),
 * and looking at the UI while working on it without loading the extension.
 * Nothing here ships: the harness lives outside `src/` and `dist/`.
 *
 * Query string: `?scene=out` starts signed out; `?theme=dark` forces a theme.
 */
(() => {
  const params = new URLSearchParams(location.search);
  const signedOut = params.get("scene") === "out";
  const theme = params.get("theme") ?? "light";

  const PAGE = {
    url: "https://northwindroasters.example/journal/light-roast-field-guide",
    title: "A field guide to light roasts",
    favicon:
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#2f4a3c"/><path d="M4 11.5V4.5l8 7v-7" fill="none" stroke="#f1e9d8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      ),
  };

  const MARKDOWN = `# A field guide to light roasts

Light roasts keep more of what the farm put into the bean. They are also the least forgiving roast to brew: a few degrees or a few seconds decide whether a cup tastes of apricot or of hay.

## What "light" means

A roast is called light when it is dropped shortly after first crack, between **196 and 205 °C**. The bean has lost about 12% of its weight and no oil has reached the surface.

| Roast | Drop temperature | Weight loss |
| --- | --- | --- |
| Light | 196 to 205 °C | 11 to 13% |
| Medium | 210 to 220 °C | 14 to 16% |
| Dark | 225 to 240 °C | 17 to 20% |

## Brewing one well

1. Grind finer than you would for a medium roast.
2. Use water just off the boil: 96 °C, not 90.
3. Give the bloom a full 45 seconds.

> Rest the beans. A light roast tastes closed for its first week and opens up between day 10 and day 30.

## Three to start with

- [Gesha Village, Ethiopia](https://northwindroasters.example/coffee/gesha-village): jasmine, bergamot, white peach
- [Finca El Paraiso, Colombia](https://northwindroasters.example/coffee/el-paraiso): lychee, rose, strawberry
- [Kiamabara AA, Kenya](https://northwindroasters.example/coffee/kiamabara): blackcurrant, tomato leaf, brown sugar
`;

  const logo = (background, stroke) =>
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${background}"/><path d="M18 46V18l28 28V18" fill="none" stroke="${stroke}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    );

  const FIXTURES = {
    "/v1/usage": () => ({
      balance: 8640,
      period: { from: "2026-10-10", to: "2026-10-11" },
      totalCredits: 0,
      totalRequests: 0,
      byEndpoint: [],
      daily: [],
    }),
    "/v1/scrape": () => ({
      markdown: MARKDOWN,
      metadata: { title: PAGE.title, finalUrl: PAGE.url },
      renderedWith: "http",
      proxyUsed: "none",
      warnings: [],
    }),
    "/v1/parse": () => ({
      markdown: MARKDOWN,
      contentType: "text/html",
      pages: null,
      title: PAGE.title,
    }),
    "/v1/extract": () => ({
      url: PAGE.url,
      data: {
        roasts: [
          { name: "Light", dropTemperatureC: [196, 205], weightLossPercent: [11, 13] },
          { name: "Medium", dropTemperatureC: [210, 220], weightLossPercent: [14, 16] },
          { name: "Dark", dropTemperatureC: [225, 240], weightLossPercent: [17, 20] },
        ],
        brewing: { waterTemperatureC: 96, bloomSeconds: 45, grind: "finer than medium" },
        restDays: { from: 10, to: 30 },
        recommended: ["Gesha Village", "Finca El Paraiso", "Kiamabara AA"],
      },
    }),
    "/v1/brand": () => ({
      domain: "northwindroasters.example",
      name: "Northwind Roasters",
      title: "Northwind Roasters",
      description: "Small-batch coffee, roasted to order in Bergen.",
      slogan: "Small-batch coffee, roasted to order.",
      logos: [
        {
          url: logo("#2f4a3c", "#f1e9d8"),
          type: "icon",
          format: "svg",
          width: 64,
          height: 64,
          theme: null,
        },
        {
          url: logo("#f1e9d8", "#2f4a3c"),
          type: "symbol",
          format: "svg",
          width: 64,
          height: 64,
          theme: null,
        },
        {
          url: logo("#c8643c", "#fff8ec"),
          type: "apple-touch-icon",
          format: "svg",
          width: 64,
          height: 64,
          theme: null,
        },
      ],
      colors: [
        { hex: "#2f4a3c", name: null },
        { hex: "#f1e9d8", name: null },
        { hex: "#c8643c", name: null },
        { hex: "#1c2420", name: null },
        { hex: "#8a9a85", name: null },
      ],
      fonts: ["Fraunces", "Inter"],
      socials: [
        { network: "instagram", url: "https://instagram.com/" },
        { network: "youtube", url: "https://youtube.com/" },
        { network: "github", url: "https://github.com/" },
      ],
      address: { street: null, city: "Bergen", region: null, postalCode: null, country: "Norway" },
      email: "hello@northwindroasters.example",
      phone: null,
      stock: null,
      industries: {
        naics: [{ code: "311920", title: "Coffee and Tea Manufacturing", confidence: 0.94 }],
        sic: [],
      },
      isNsfw: false,
      updatedAt: "2026-10-11T09:00:00.000Z",
    }),
    "/v1/styleguide": () => ({
      url: PAGE.url,
      colorScheme: "light",
      colors: {
        background: "#f1e9d8",
        foreground: "#1c2420",
        primary: "#2f4a3c",
        accent: "#c8643c",
        palette: [
          "#f1e9d8",
          "#1c2420",
          "#2f4a3c",
          "#c8643c",
          "#8a9a85",
          "#e3d7bf",
          "#fff8ec",
          "#5b6b60",
        ].map((hex, i) => ({ hex, usage: 40 - i * 4 })),
      },
      typography: {
        fonts: [
          { family: "Fraunces", usage: ["headings"], source: null },
          { family: "Inter", usage: ["body", "buttons"], source: null },
        ],
        headings: {
          h1: { fontFamily: "Fraunces", fontSize: "48px", fontWeight: "600", lineHeight: "52px" },
          h2: { fontFamily: "Fraunces", fontSize: "30px", fontWeight: "600", lineHeight: "36px" },
          h3: { fontFamily: "Fraunces", fontSize: "22px", fontWeight: "600", lineHeight: "28px" },
        },
        body: { fontFamily: "Inter", fontSize: "17px", lineHeight: "28px" },
      },
      components: { button: null, link: null, input: null },
      radii: ["4px", "10px", "999px"],
      shadows: [],
      spacing: ["4px", "8px", "16px", "24px", "48px"],
      cssVariables: {},
    }),
    "/v1/map": () => ({
      links: [
        "",
        "coffee",
        "coffee/gesha-village",
        "coffee/el-paraiso",
        "coffee/kiamabara",
        "coffee/decaf-huila",
        "journal",
        "journal/light-roast-field-guide",
        "journal/water-for-coffee",
        "journal/resting-beans",
        "journal/grinder-alignment",
        "subscriptions",
        "wholesale",
        "brew-guides/v60",
        "brew-guides/aeropress",
        "brew-guides/espresso",
        "about",
        "shipping",
      ].map((path) => ({ url: `https://northwindroasters.example/${path}`, lastmod: null })),
      sources: ["sitemap"],
    }),
    "/v1/search": () => ({
      results: [
        {
          url: "https://northwindroasters.example/journal/light-roast-field-guide",
          title: "A field guide to light roasts",
          snippet:
            "Light roasts keep more of what the farm put into the bean, and are the least forgiving to brew.",
        },
        {
          url: "https://coffeescience.example/roast-degree",
          title: "Roast degree, measured: what the numbers mean",
          snippet:
            "Drop temperature, weight loss and colour readings compared across forty roasts.",
        },
        {
          url: "https://brewlab.example/water",
          title: "Water recipes for filter coffee",
          snippet: "Why 96 degrees and 80 ppm hardness bring out acidity without sourness.",
        },
      ].map((hit) => ({ ...hit, publishedAt: null, image: null, source: null })),
    }),
  };

  FIXTURES["/v1/screenshot"] = () => ({
    url: PAGE.url,
    screenshot:
      "data:image/svg+xml;base64," +
      btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 900"><rect width="720" height="900" fill="#f1e9d8"/><rect width="720" height="56" fill="#2f4a3c"/><rect x="60" y="120" width="420" height="34" rx="4" fill="#1c2420"/><rect x="60" y="176" width="600" height="10" rx="4" fill="#8a9a85"/><rect x="60" y="198" width="560" height="10" rx="4" fill="#8a9a85"/><rect x="60" y="220" width="590" height="10" rx="4" fill="#8a9a85"/><rect x="60" y="270" width="600" height="220" rx="6" fill="#e3d7bf"/><rect x="60" y="530" width="300" height="22" rx="4" fill="#1c2420"/><rect x="60" y="574" width="600" height="10" rx="4" fill="#8a9a85"/><rect x="60" y="596" width="520" height="10" rx="4" fill="#8a9a85"/></svg>',
      ),
    width: 1440,
    height: 1800,
    format: "png",
  });

  const meta = (creditsUsed, durationMs) => ({
    requestId: "req_01k7h3v9d2",
    creditsUsed,
    cached: false,
    durationMs,
  });
  const COST = {
    "/v1/usage": [0, 40],
    "/v1/scrape": [1, 842],
    "/v1/parse": [2, 310],
    "/v1/extract": [9, 3120],
    "/v1/brand": [10, 2260],
    "/v1/styleguide": [5, 4180],
    "/v1/map": [1, 960],
    "/v1/search": [2, 1240],
    "/v1/screenshot": [5, 5210],
  };

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : (input.href ?? input.url));
    const reply = (body) =>
      new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    if (url.pathname === "/api/demo")
      return reply({ markdown: MARKDOWN.slice(0, 900), links: [], durationMs: 900 });
    const fixture = FIXTURES[url.pathname];
    if (!fixture) return realFetch(input, init);
    await new Promise((resolve) => setTimeout(resolve, 120));
    return reply({ data: fixture(), meta: meta(...COST[url.pathname]) });
  };

  const now = Date.now();
  const stores = {
    local: {
      settings: { theme },
      ...(signedOut
        ? {}
        : {
            account: {
              apiKey: "pk_live_harness0000000000000000",
              apiUrl: "https://pluck-api.procd.cc",
              via: "connect",
              workspace: { id: "org_harness", name: "Acme research" },
              user: { name: "Sam Rivera", email: "sam@acme.example" },
              connectedAt: now,
            },
            history: [
              {
                id: "h1",
                tool: "extract",
                title: "Pricing: Lumen Analytics",
                url: "https://lumen.example/pricing",
                at: now - 4 * 60_000,
                credits: 9,
                text: '{\n  "plans": []\n}',
                filename: "lumen-extract.json",
              },
              {
                id: "h2",
                tool: "markdown",
                title: "How we cut cold starts by 80%",
                url: "https://blog.example/cold-starts",
                at: now - 38 * 60_000,
                credits: 1,
                text: "# How we cut cold starts by 80%\n",
                filename: "cold-starts.md",
              },
              {
                id: "h3",
                tool: "brand",
                title: "Northwind Roasters",
                url: "https://northwindroasters.example",
                at: now - 3 * 3_600_000,
                credits: 10,
                text: "{}",
                filename: "northwind-brand.json",
              },
            ],
          }),
    },
    session: {},
  };

  const listeners = new Set();
  const area = (name) => ({
    async get(key) {
      return key in stores[name] ? { [key]: stores[name][key] } : {};
    },
    async set(items) {
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: stores[name][key], newValue: value };
        stores[name][key] = value;
      }
      for (const fn of listeners) fn(changes, name);
    },
    async remove(key) {
      if (!(key in stores[name])) return;
      const changes = { [key]: { oldValue: stores[name][key] } };
      delete stores[name][key];
      for (const fn of listeners) fn(changes, name);
    },
  });

  const tab = {
    id: 7,
    windowId: 1,
    active: true,
    url: PAGE.url,
    title: PAGE.title,
    favIconUrl: PAGE.favicon,
  };
  const event = () => ({ addListener() {}, removeListener() {} });

  window.chrome = {
    storage: {
      local: area("local"),
      session: area("session"),
      onChanged: {
        addListener: (fn) => listeners.add(fn),
        removeListener: (fn) => listeners.delete(fn),
      },
    },
    windows: { getCurrent: async () => ({ id: 1 }) },
    tabs: {
      TAB_ID_NONE: -1,
      query: async () => [tab],
      create: async () => ({}),
      onActivated: event(),
      onUpdated: event(),
    },
    runtime: {
      id: "hgkfgpnbppnnejjceopofjknfcffeoao",
      openOptionsPage: async () => {},
      getPlatformInfo: async () => ({ os: "win" }),
      getURL: (path) => path,
    },
    scripting: {
      executeScript: async () => [
        {
          result: {
            html: "<html><body><h1>Field guide</h1></body></html>",
            title: PAGE.title,
            url: PAGE.url,
            truncated: false,
          },
        },
      ],
    },
    permissions: { request: async () => true, remove: async () => true },
    i18n: { getMessage: (key) => key },
  };
})();
