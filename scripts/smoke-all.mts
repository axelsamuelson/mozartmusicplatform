import { runPlaybackSmoke } from "./smoke-playback.mts";
import { runRatingsSmoke } from "./smoke-ratings.mts";

async function main(): Promise<void> {
  console.log("=== smoke: all ===\n");
  await runRatingsSmoke();
  console.log("");
  await runPlaybackSmoke();
  console.log("\n=== smoke: all passed ===");
}

main().catch((e) => {
  console.error("=== smoke: all FAILED ===", e instanceof Error ? e.message : e);
  process.exit(1);
});
