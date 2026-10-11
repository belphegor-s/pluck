/**
 * Wires a scene to its query string. A caption may mark one phrase with
 * *asterisks* to have it set in the accent color.
 *
 *   ?headline=…&sub=…   the caption (screenshots)
 *   ?scene=out          start the panel signed out
 *   ?theme=dark         dark panel and dark frame
 *   ?size=small|marquee which promo tile to show
 */
const params = new URLSearchParams(location.search);
const theme = params.get("theme") ?? "light";
document.documentElement.dataset.theme = theme;

const headline = document.getElementById("headline");
if (headline) {
  headline.textContent = "";
  for (const [i, part] of (params.get("headline") ?? "").split("*").entries()) {
    const node = document.createElement(i % 2 ? "em" : "span");
    node.textContent = part;
    headline.append(node);
  }
}
const sub = document.getElementById("sub");
if (sub) sub.textContent = params.get("sub") ?? "";

const size = params.get("size");
if (size) document.getElementById(size)?.removeAttribute("hidden");

const panel = document.getElementById("panel");
if (panel && (!size || size === "marquee")) {
  const query = new URLSearchParams({ theme });
  if (params.get("scene")) query.set("scene", params.get("scene"));
  panel.src = `../harness/panel.html?${query}`;
}
