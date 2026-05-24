import { createAdminClient } from "@/lib/supabase/admin";

import {
  defaultTestUserPassword,
  LIVE_TEST_PERSONAS,
  type LiveTestPersona,
} from "@/lib/dev/liveTestPersonas";

export type EnsuredTestUser = LiveTestPersona & {
  userId: string;
};

async function findUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  let page = 1;
  const perPage = 200;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const hit = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (hit?.id) return hit.id;
    if (data.users.length < perPage) break;
    page += 1;
  }
  return null;
}

export async function ensureLiveTestUsers(): Promise<EnsuredTestUser[]> {
  const admin = createAdminClient();
  const password = defaultTestUserPassword();
  const out: EnsuredTestUser[] = [];

  for (const persona of LIVE_TEST_PERSONAS) {
    let userId = await findUserIdByEmail(admin, persona.email);

    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: persona.email,
        password,
        email_confirm: true,
        user_metadata: { display_name: persona.displayName, wam_test_user: true },
      });
      if (error) {
        userId = await findUserIdByEmail(admin, persona.email);
        if (!userId) {
          throw new Error(
            `Could not create test user ${persona.email}: ${error.message}`,
          );
        }
      } else {
        userId = data.user.id;
      }
    }

    out.push({ ...persona, userId });
  }

  return out;
}
