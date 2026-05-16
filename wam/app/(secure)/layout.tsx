import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/** Server-side auth gate (replaces Edge middleware to avoid Vercel Edge / __dirname issues). */
export default async function SecureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/");
  }
  return <>{children}</>;
}
