import { cleanupNotificationsSince } from "../cleanup-notifications";
import { loadTestUsers } from "../test-users";
import { startFakeOpenAi } from "./fake-openai";
import { removeStaleTestData } from "./stale-data";

// Runs once before the e2e suite: clears data left by earlier runs that were stopped midway. The
// returned function runs after the suite and removes the notifications the run caused.
export default async function globalSetup() {
  if (!loadTestUsers()) return;
  await removeStaleTestData();
  const startedAt = new Date().toISOString();
  const fakeOpenAi = await startFakeOpenAi();
  return async () => {
    fakeOpenAi.close();
    await cleanupNotificationsSince(startedAt);
  };
}
