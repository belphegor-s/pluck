import "server-only";
import { Polar } from "@polar-sh/sdk";

/**
 * Polar is optional: a self-hosted instance has no billing at all, so every
 * helper here returns null rather than throwing when it is not configured.
 */
export function polarClient(): Polar | null {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) return null;
  return new Polar({
    accessToken,
    server: process.env.POLAR_SERVER === "sandbox" ? "sandbox" : "production",
  });
}

/** Ledger references for purchases look like `polar:<order id>`. */
export const orderIdFromReference = (reference: string | null): string | null =>
  reference?.startsWith("polar:") ? reference.slice("polar:".length) : null;

/**
 * The hosted portal is where a customer manages payment details and downloads
 * past invoices, so it is also the right fallback when a single invoice cannot
 * be produced (Polar needs a billing name and address before it will issue one).
 */
export async function customerPortalUrl(userId: string): Promise<string | null> {
  const polar = polarClient();
  if (!polar) return null;
  try {
    const session = await polar.customerSessions.create({ externalCustomerId: userId });
    return session.customerPortalUrl;
  } catch {
    return null;
  }
}

/**
 * Returns a download URL for an order's invoice, generating it on first ask.
 * Generation is asynchronous, so we poll briefly rather than make the caller
 * come back later.
 */
export async function invoiceUrl(orderId: string): Promise<string | null> {
  const polar = polarClient();
  if (!polar) return null;

  const fetchUrl = async () => {
    try {
      const invoice = await polar.orders.invoice({ id: orderId });
      return invoice.url;
    } catch {
      return null;
    }
  };

  const existing = await fetchUrl();
  if (existing) return existing;

  try {
    await polar.orders.generateInvoice({ id: orderId });
  } catch {
    return null;
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const url = await fetchUrl();
    if (url) return url;
  }
  return null;
}
