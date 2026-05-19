const ADJECTIVES = [
  "Neon",
  "Silent",
  "Cosmic",
  "Velvet",
  "Golden",
  "Midnight",
  "Electric",
  "Lazy",
  "Brave",
  "Fuzzy",
  "Crystal",
  "Wild",
  "Calm",
  "Hidden",
  "Lucky",
  "Solar",
  "Icy",
  "Rusty",
  "Swift",
  "Mellow",
] as const;

const NOUNS = [
  "Otter",
  "Wave",
  "Comet",
  "Panda",
  "Fox",
  "Echo",
  "Vinyl",
  "Moth",
  "Tiger",
  "Cloud",
  "Pixel",
  "Raven",
  "Lotus",
  "Badger",
  "Orbit",
  "Finch",
  "Maple",
  "Cobra",
  "Drift",
  "Spark",
] as const;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** e.g. "Neon Otter" */
export function generateAnonymousAlias(): string {
  return `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
}

/** Fallback if the random pool collides within a session. */
export function generateAnonymousAliasWithSuffix(): string {
  const n = Math.floor(Math.random() * 90) + 10;
  return `${generateAnonymousAlias()} ${n}`;
}
