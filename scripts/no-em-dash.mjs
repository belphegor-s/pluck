#!/usr/bin/env node
/**
 * House style: no em dashes anywhere in the project. Use a colon, comma,
 * semicolon, parentheses or a new sentence instead. Runs as part of
 * `pnpm lint`, so CI fails on any tracked file that contains one.
 *
 * Code that must match an em dash in input (a page title, say) writes it as
 * the escape —.
 */
import { execFileSync } from "node:child_process";

const DASH = String.fromCharCode(0x2014);
let out = "";
try {
  out = execFileSync("git", ["grep", "-n", "-I", "-F", DASH, "--", ".", ":!pnpm-lock.yaml"], {
    encoding: "utf8",
  });
} catch (err) {
  // git grep exits 1 when nothing matches, which is the passing case.
  if (err.status !== 1) throw err;
}
if (out.trim()) {
  console.error(`Em dashes are not allowed. Rewrite these lines:\n${out}`);
  process.exit(1);
}
