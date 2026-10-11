#!/usr/bin/env node
/**
 * Zips `dist/` into `release/pluck-extension-<version>.zip`, the file the
 * Chrome Web Store takes.
 *
 * The archive is written here rather than by a zip tool so it is reproducible:
 * entries are sorted and carry a fixed timestamp, so the same source always
 * gives the same bytes and a reviewer can check a build against the repository.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

/** 1980-01-01 00:00, the earliest date the format can express. */
const DOS_DATE = (1 << 5) | 1;
const UTF8_NAMES = 0x0800;

function zip(entries) {
  const body = [];
  const directory = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const file = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const payload = stored ? data : deflated;
    const method = stored ? 0 : 8;
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(file.length, 26);
    body.push(local, file, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_NAMES, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(file.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, file);

    offset += local.length + file.length + payload.length;
  }

  const directorySize = directory.reduce((n, part) => n + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...body, ...directory, end]);
}

const manifest = JSON.parse(await readFile(join(DIST, "manifest.json"), "utf8"));
// The store assigns the id; a manifest carrying the development key is a
// development build and must not be uploaded.
if (manifest.key) {
  console.error("dist/ is a development build (it has a manifest key). Run `pnpm build` first.");
  process.exit(1);
}

const files = (await walk(DIST)).sort();
const entries = await Promise.all(
  files.map(async (path) => ({
    name: relative(DIST, path).split(sep).join("/"),
    data: await readFile(path),
  })),
);
const archive = zip(entries);
const target = join(ROOT, "release", `pluck-extension-${manifest.version}.zip`);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, archive);

const kb = (archive.length / 1024).toFixed(0);
const digest = createHash("sha256").update(archive).digest("hex");
console.log(`${relative(ROOT, target)}  ${entries.length} files, ${kb} KB`);
console.log(`sha256 ${digest}`);
