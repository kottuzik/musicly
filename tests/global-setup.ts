import { config } from "dotenv";
import { cleanupNotificationsSince } from "./cleanup-notifications";

config({ path: ".env", quiet: true });

// Vitest global setup: the returned function runs once after all test files.
export default function setup() {
  const startedAt = new Date().toISOString();
  return async () => {
    await cleanupNotificationsSince(startedAt);
  };
}
