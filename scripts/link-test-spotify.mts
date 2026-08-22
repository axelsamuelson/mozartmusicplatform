import { ensureLiveTestUsers } from "@/lib/dev/ensureLiveTestUsers";
import { linkTestUserSpotifyRefresh } from "@/lib/dev/linkTestUserSpotifyRefresh";

async function main(): Promise<void> {
  const users = await ensureLiveTestUsers();
  const alex = users[0];
  if (!alex) {
    throw new Error("No test users found");
  }

  const result = await linkTestUserSpotifyRefresh(alex.userId, alex.email);
  if (!result.linked) {
    console.error("[link-test-spotify] not linked:", result.reason);
    process.exit(1);
  }

  console.log("[link-test-spotify] linked Spotify refresh to", result.email);
}

main().catch((e) => {
  console.error("[link-test-spotify] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
