import { CodeTabsClient } from "@/components/code-tabs-client";
import { highlight } from "@/lib/highlight";

export interface CodeSample {
  label: string;
  language: string;
  code: string;
}

/** Highlights on the server so no syntax highlighter ships to the browser. */
export async function CodeTabs({
  samples,
  className = "",
}: {
  samples: CodeSample[];
  className?: string;
}) {
  const rendered = await Promise.all(
    samples.map(async (sample) => ({
      label: sample.label,
      code: sample.code,
      html: await highlight(sample.code, sample.language),
    })),
  );
  return <CodeTabsClient samples={rendered} className={className} />;
}

export async function CodeBlock({
  code,
  language,
  className = "",
}: {
  code: string;
  language: string;
  className?: string;
}) {
  const html = await highlight(code, language);
  return (
    <div
      className={`sheet shiki-block overflow-x-auto p-4 text-[0.8rem] leading-relaxed ${className}`}
      // Highlighted from our own source strings.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
