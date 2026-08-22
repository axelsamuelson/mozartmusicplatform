import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { devLiveApiAllowed } from "@/lib/dev/liveSimulateGate";
import { ensureLiveTestUsers } from "@/lib/dev/ensureLiveTestUsers";
import { defaultTestUserPassword } from "@/lib/dev/liveTestPersonas";

/** Dev-only: establish a Supabase session cookie for automated smoke tests. */
export async function POST(request: NextRequest) {
  if (!devLiveApiAllowed(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await ensureLiveTestUsers();
  const testUser = users[0];
  if (!testUser) {
    return NextResponse.json({ error: "No test users" }, { status: 500 });
  }

  let response = NextResponse.json({
    ok: true,
    email: testUser.email,
    userId: testUser.userId,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({
    email: testUser.email,
    password: defaultTestUserPassword(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return response;
}
