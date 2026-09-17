import type { Product } from "@pluck/shared";
import { type Doc, absolute } from "../html/document.js";
import { ldTypes, readJsonLd } from "../html/metadata.js";

type Ld = Record<string, unknown>;

/** Products declared through schema.org JSON-LD: free, instant and exact. */
export function productsFromStructuredData(doc: Doc, baseUrl: string): Product[] {
  const nodes = readJsonLd(doc);
  const products: Product[] = [];
  const seen = new Set<string>();

  const visit = (node: Ld) => {
    const types = ldTypes(node);
    if (types.includes("Product") || types.includes("ProductGroup")) {
      const p = toProduct(node, baseUrl);
      const key = p.url ?? p.sku ?? p.name;
      if (p.name && !seen.has(key)) {
        seen.add(key);
        products.push(p);
      }
    }
    if (types.includes("ItemList") && Array.isArray(node.itemListElement)) {
      for (const el of node.itemListElement as Ld[]) {
        const item = (el.item as Ld | undefined) ?? el;
        if (item && typeof item === "object") visit(item);
      }
    }
  };
  nodes.forEach(visit);
  return products;
}

function toProduct(node: Ld, baseUrl: string): Product {
  const offersRaw = node.offers;
  const offers = (Array.isArray(offersRaw) ? offersRaw[0] : offersRaw) as Ld | undefined;
  const aggregate = offers && ldTypes(offers).includes("AggregateOffer") ? offers : undefined;
  const priceValue = aggregate?.lowPrice ?? offers?.price ?? (offers?.priceSpecification as Ld | undefined)?.price;
  const rating = node.aggregateRating as Ld | undefined;
  const images = (Array.isArray(node.image) ? node.image : node.image ? [node.image] : [])
    .map((i) => (typeof i === "string" ? i : str((i as Ld).url)))
    .map((i) => absolute(i, baseUrl))
    .filter((i): i is string => Boolean(i));

  const attributes: Record<string, string> = {};
  for (const key of ["color", "size", "material", "pattern", "model", "weight"]) {
    const v = node[key];
    if (typeof v === "string") attributes[key] = v;
  }
  for (const prop of (Array.isArray(node.additionalProperty) ? node.additionalProperty : []) as Ld[]) {
    if (typeof prop.name === "string" && prop.value != null) attributes[prop.name] = String(prop.value);
  }

  return {
    name: str(node.name) ?? "",
    description: str(node.description),
    brand: str(node.brand) ?? str((node.brand as Ld | undefined)?.name),
    sku: str(node.sku) ?? str(node.productID),
    gtin: str(node.gtin13) ?? str(node.gtin12) ?? str(node.gtin14) ?? str(node.gtin8) ?? str(node.gtin),
    url: absolute(str(node.url) ?? str(offers?.url), baseUrl),
    images,
    price: priceValue != null && !Number.isNaN(Number(priceValue)) ? Number(priceValue) : null,
    currency: str(offers?.priceCurrency) ?? str(aggregate?.priceCurrency),
    availability: availability(str(offers?.availability)),
    rating: rating?.ratingValue != null ? Number(rating.ratingValue) : null,
    reviewCount: rating?.reviewCount != null ? Number(rating.reviewCount) : rating?.ratingCount != null ? Number(rating.ratingCount) : null,
    category: str(node.category),
    attributes,
  };
}

function availability(v: string | null): Product["availability"] {
  if (!v) return "unknown";
  if (/InStock|LimitedAvailability|OnlineOnly|InStoreOnly/i.test(v)) return "in_stock";
  if (/OutOfStock|SoldOut|Discontinued/i.test(v)) return "out_of_stock";
  if (/PreOrder|BackOrder|PreSale/i.test(v)) return "preorder";
  return "unknown";
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
