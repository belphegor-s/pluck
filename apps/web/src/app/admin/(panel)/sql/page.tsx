import type { Metadata } from "next";
import { SqlConsole } from "@/components/admin/sql-console";
import { requireAdmin } from "@/lib/admin/auth";
import { schemaCatalog } from "@/lib/admin/sql";

export const metadata: Metadata = { title: "SQL" };

export default async function AdminSql() {
  await requireAdmin();
  let tables: Awaited<ReturnType<typeof schemaCatalog>> = [];
  let problem: string | null = null;
  try {
    tables = await schemaCatalog();
  } catch (err) {
    problem = (err as Error).message;
  }
  return <SqlConsole tables={tables} problem={problem} />;
}
