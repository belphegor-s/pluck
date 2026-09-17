import { type ParseResult, PluckError } from "@pluck/shared";
import { htmlToMarkdown } from "../html/content.js";
import { parseDocument, text } from "../html/document.js";
import { decodeBody } from "../net/fetch.js";

export type DocumentKind = "pdf" | "docx" | "html" | "markdown" | "text" | "csv" | "json" | "xml";

export function detectKind(
  body: Buffer,
  contentType: string | null,
  filename?: string,
): DocumentKind | null {
  const ct = (contentType ?? "").toLowerCase();
  const ext = filename?.toLowerCase().split(".").pop() ?? "";
  if (body.subarray(0, 5).toString("latin1") === "%PDF-" || ct.includes("pdf") || ext === "pdf")
    return "pdf";
  if (
    ct.includes("officedocument.wordprocessingml") ||
    ext === "docx" ||
    (body[0] === 0x50 && body[1] === 0x4b && ext !== "xlsx" && ext !== "zip" && ct.includes("word"))
  ) {
    return "docx";
  }
  if (ct.includes("html") || ext === "html" || ext === "htm") return "html";
  if (ct.includes("markdown") || ext === "md" || ext === "mdx") return "markdown";
  if (ct.includes("csv") || ext === "csv") return "csv";
  if (ct.includes("json") || ext === "json") return "json";
  if (ct.includes("xml") || ext === "xml" || ext === "rss" || ext === "atom") return "xml";
  if (ct.startsWith("text/") || ext === "txt") return "text";
  const head = body.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return "html";
  return null;
}

export async function parseDocumentBytes(
  body: Buffer,
  { contentType, filename }: { contentType: string | null; filename?: string },
): Promise<ParseResult> {
  const kind = detectKind(body, contentType, filename);
  switch (kind) {
    case "pdf": {
      const { extractText, getDocumentProxy, getMeta } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(body));
      const [{ totalPages, text: pages }, meta] = await Promise.all([
        extractText(pdf, { mergePages: false }),
        getMeta(pdf).catch(() => null),
      ]);
      const title = (meta?.info as { Title?: string } | undefined)?.Title?.trim() || null;
      const markdown = (pages as string[])
        .map((p, i) => `<!-- page ${i + 1} -->\n\n${tidyPdfText(p)}`)
        .join("\n\n");
      return { markdown, contentType: "application/pdf", pages: totalPages, title };
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.convertToHtml({ buffer: body });
      const title = text(parseDocument(value).querySelector("h1")) || null;
      return {
        markdown: htmlToMarkdown(value),
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        pages: null,
        title,
      };
    }
    case "html": {
      const html = decodeBody(body, contentType);
      const doc = parseDocument(html);
      return {
        markdown: htmlToMarkdown(doc.body?.innerHTML ?? html),
        contentType: "text/html",
        pages: null,
        title: text(doc.querySelector("title")) || null,
      };
    }
    case "csv":
      return {
        markdown: csvToMarkdown(decodeBody(body, contentType)),
        contentType: "text/csv",
        pages: null,
        title: null,
      };
    case "json": {
      const raw = decodeBody(body, contentType);
      let pretty = raw;
      try {
        pretty = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        // Keep the raw text when it is not valid JSON.
      }
      return {
        markdown: `\`\`\`json\n${pretty}\n\`\`\``,
        contentType: "application/json",
        pages: null,
        title: null,
      };
    }
    case "xml":
      return {
        markdown: `\`\`\`xml\n${decodeBody(body, contentType)}\n\`\`\``,
        contentType: "application/xml",
        pages: null,
        title: null,
      };
    case "markdown":
    case "text":
      return {
        markdown: decodeBody(body, contentType),
        contentType: kind === "text" ? "text/plain" : "text/markdown",
        pages: null,
        title: null,
      };
    default:
      throw new PluckError(
        "unsupported_content",
        `Unsupported content type: ${contentType ?? filename ?? "unknown"}`,
      );
  }
}

function tidyPdfText(page: string): string {
  return page
    .replace(/-\n(\w)/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function csvToMarkdown(csv: string): string {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]!;
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
    if (rows.length > 5_000) break;
  }
  if (cell || row.length) rows.push([...row, cell]);
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const fmt = (r: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => (r[i] ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`;
  return [
    fmt(rows[0]!),
    `| ${Array(width).fill("---").join(" | ")} |`,
    ...rows.slice(1).map(fmt),
  ].join("\n");
}
