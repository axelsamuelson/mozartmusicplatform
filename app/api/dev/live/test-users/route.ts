import { type NextRequest, NextResponse } from "next/server";

import { devLiveApiAllowed } from "@/lib/dev/liveSimulateGate";
import { ensureLiveTestUsers } from "@/lib/dev/ensureLiveTestUsers";
import { defaultTestUserPassword, MIN_LIVE_TEST_USERS } from "@/lib/dev/liveTestPersonas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!devLiveApiAllowed(request)) {
    return NextResponse.json({ error: "Dev live API disabled" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await ensureLiveTestUsers();
    return NextResponse.json({
      count: users.length,
      minRequired: MIN_LIVE_TEST_USERS,
      passwordHint: defaultTestUserPassword(),
      users: users.map((u) => ({
        userId: u.userId,
        email: u.email,
        displayName: u.displayName,
        key: u.key,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to ensure test users" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
