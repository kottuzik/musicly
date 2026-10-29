import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

describe("secret key isolation", () => {
  const ADMIN_CLIENT = join("src", "lib", "supabase", "admin.ts");
  const sourceFiles = () => listFiles("src").filter((f) => /\.(ts|tsx)$/.test(f));

  it("references the Supabase secret key only in the server-only admin client", () => {
    const offenders = sourceFiles().filter((f) => readFileSync(f, "utf8").includes("SUPABASE_SECRET_KEY"));
    expect(offenders).toEqual([ADMIN_CLIENT]);
    expect(readFileSync(ADMIN_CLIENT, "utf8")).toContain('import "server-only"');
  });

  it("never imports the admin client from client components", () => {
    const offenders = sourceFiles().filter((f) => {
      const source = readFileSync(f, "utf8");
      return source.includes('"use client"') && source.includes("@/lib/supabase/admin");
    });
    expect(offenders).toEqual([]);
  });

  it("keeps NEXT_PUBLIC variables limited to URL, publishable key and site URL", () => {
    const allowed = new Set(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SITE_URL"]);
    const used = new Set<string>();
    for (const file of listFiles("src").filter((f) => /\.(ts|tsx)$/.test(f))) {
      for (const match of readFileSync(file, "utf8").matchAll(/NEXT_PUBLIC_[A-Z_]+/g)) used.add(match[0]);
    }
    expect([...used].filter((name) => !allowed.has(name))).toEqual([]);
  });
});
