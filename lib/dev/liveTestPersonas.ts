/** Minimum participants shown / seeded in dev live tests. */
export const MIN_LIVE_TEST_USERS = 4;

export type LiveTestPersona = {
  key: string;
  email: string;
  displayName: string;
};

/** Stable dev-only identities — created via POST /api/dev/live/test-users. */
export const LIVE_TEST_PERSONAS: LiveTestPersona[] = [
  {
    key: "alex",
    email: "wam-test-alex@musicator.dev",
    displayName: "Test Alex",
  },
  {
    key: "bea",
    email: "wam-test-bea@musicator.dev",
    displayName: "Test Bea",
  },
  {
    key: "cruz",
    email: "wam-test-cruz@musicator.dev",
    displayName: "Test Cruz",
  },
  {
    key: "dana",
    email: "wam-test-dana@musicator.dev",
    displayName: "Test Dana",
  },
];

export function defaultTestUserPassword(): string {
  return process.env.WAM_TEST_USER_PASSWORD ?? "wam-dev-test-12!";
}
