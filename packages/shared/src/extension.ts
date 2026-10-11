import { z } from "zod";
import { BRAND } from "./identity.js";

/**
 * The browser extension's sign-in handshake, shared by the web app (which
 * issues codes and keys) and the extension build (which reads the constants).
 *
 * Accounts are only ever created on the site. The extension opens
 * `/extension/connect` in a normal tab, the signed-in user approves, and the
 * page hands the extension a one-time code. The extension swaps that code,
 * plus the PKCE verifier only it holds, for an API key of its own.
 */

/** Chrome derives ids from the signing key: 32 letters, a to p. */
export const extensionId = z.string().regex(/^[a-p]{32}$/, "Not a Chrome extension id.");

/**
 * The unpacked development build. This public key in the manifest pins the id,
 * so local sign-in works on every machine without configuration. The store
 * build carries no key and gets the id the Chrome Web Store assigned, which is
 * `BRAND.chromeExtensionId`.
 */
export const DEV_EXTENSION = {
  id: "hgkfgpnbppnnejjceopofjknfcffeoao",
  key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAv1oZYmd/WsOYDgJksbehy++9oQlZM8AMg8NJG2K4awRk7ZEaYxPOH4eDPrZBxTW0gnXBsbzTPG4LftL51byYnP/yfqc/HRD0OY+hIqbYlc2TfATMA/SlqtL9wsnY5TrF8RMYBeu2veo47TVIsbt0L2I+KZgI50Vo1np2YW70JDsuqTL3QrwiEfp+O4xPJlr4ByfX7smc4ZROXzZgBeCqB/QsjOB2sCPGHVG1rU3kzD32PpVHCxAaIpdWzeKTxsi90z1zZEBfpVq4dgm2bhOmQW3Im6WopfDOfEJR7dTgQm3cwFw/CTHSUxV9+Kj2chy8/txzqLxFs+qeppHEzMmlbwIDAQAB",
} as const;

/** Messages the connect page sends to the extension: `pluck:ping`, `pluck:connect`. */
export const EXTENSION_MESSAGE = {
  ping: `${BRAND.slug}:ping`,
  connect: `${BRAND.slug}:connect`,
} as const;

const base64url = (min: number, max: number) =>
  z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${min},${max}}$`));

/** Query string of `/extension/connect`, written by the extension. */
export const extensionConnectParams = z.object({
  ext: extensionId,
  /** base64url(SHA-256(verifier)): 32 bytes, so always 43 characters. */
  challenge: base64url(43, 43),
  /** Echoed back with the code so the extension can match its own request. */
  state: base64url(16, 64),
  /** A short label for the key, such as "Windows 4f2a". Display only. */
  device: z
    .string()
    .trim()
    .max(40)
    .regex(/^[\w .-]*$/)
    .optional(),
});
export type ExtensionConnectParams = z.infer<typeof extensionConnectParams>;

/** Body of `POST /api/extension/token`. */
export const extensionTokenRequest = z.object({
  code: base64url(43, 43),
  verifier: base64url(43, 128),
});

export interface ExtensionTokenResponse {
  apiKey: string;
  apiUrl: string;
  workspace: { id: string; name: string };
  user: { name: string; email: string };
}

/** Workspace keys made for the extension are named like this in the dashboard. */
export const extensionKeyName = (device?: string) =>
  device ? `Chrome extension (${device})` : "Chrome extension";
