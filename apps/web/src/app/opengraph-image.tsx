import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share card: the mark, the promise, and the shape of a response. */
export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#eaeee9",
        color: "#0d211b",
        padding: 72,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 28, height: 28, borderRadius: 999, background: "#b7185c" }} />
        <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -1 }}>
          {SITE.name.toLowerCase()}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 76,
            fontWeight: 700,
            letterSpacing: -2.5,
            lineHeight: 1.05,
          }}
        >
          <span>Give your model the page,</span>
          <span>not the HTML.</span>
        </div>
        <div style={{ fontSize: 28, color: "#3c544b", maxWidth: 820 }}>
          Scrape, crawl, search and extract any site as clean markdown or JSON. Open source.
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, fontSize: 22, color: "#3c544b" }}>
        <span style={{ background: "#f4f6f2", border: "1px solid #c8d2c9", padding: "8px 16px" }}>
          POST /v1/scrape
        </span>
        <span style={{ background: "#f4f6f2", border: "1px solid #c8d2c9", padding: "8px 16px" }}>
          1 credit
        </span>
        <span style={{ background: "#f4f6f2", border: "1px solid #c8d2c9", padding: "8px 16px" }}>
          {SITE.url.replace(/^https?:\/\//, "")}
        </span>
      </div>
    </div>,
    size,
  );
}
