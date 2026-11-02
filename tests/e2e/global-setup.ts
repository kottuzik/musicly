import { loadTestUsers } from "../test-users";
import { removeStaleTestData } from "./stale-data";

// Runs once before the e2e suite: clears data left by earlier runs that were stopped midway.
export default async function globalSetup() {
  if (!loadTestUsers()) return;
  await removeStaleTestData();
}
