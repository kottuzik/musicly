import { config } from "dotenv";

// Loads .env (Development values only). Values are never printed.
config({ path: ".env", quiet: true });

// Safety net: these scripts create test users and send test e-mail, so they must never touch Production.
const PRODUCTION_PROJECT_REF = "culqeemdrhuvzweessra";
if ((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes(PRODUCTION_PROJECT_REF)) {
  console.error("Refusing to run: .env points at the Production project. Use the Development project only.");
  process.exit(1);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} in .env`);
    process.exit(1);
  }
  return value;
}
