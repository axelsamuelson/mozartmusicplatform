import { type NextRequest, NextResponse } from "next/server";

import { collectClientAuditFromBridge } from "@/lib/audit/auditBridge";
import { mergeAuditReport } from "@/lib/audit/signals";
import {
  collectServerAuditSnapshot,
  type ActiveSessionRefInput,
} from "@/lib/audit/server";
import type { AuditClientSnapshot } from "@/lib/audit/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function auditAllowed(request: NextRequest): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const secret = process.env.AUDIT_SECRET;
  if (!secret) return false;
  return request.headers.get("x-audit-secret") === secret;
}

export async function GET(request: NextRequest) {
  if (!auditAllowed(request)) {
    return NextResponse.json(
      {
        error:
          "Audit API is disabled in production unless AUDIT_SECRET is set and sent as x-audit-secret header.",
      },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const server = await collectServerAuditSnapshot(user.id, null);
  const client = collectClientAuditFromBridge();
  const report = mergeAuditReport(server, client);

  return NextResponse.json(report);
}

type PostBody = {
  client?: AuditClientSnapshot;
  activeLiveSession?: ActiveSessionRefInput;
};

export async function POST(request: NextRequest) {
  if (!auditAllowed(request)) {
    return NextResponse.json({ error: "Audit API disabled" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostBody = {};
  try {
    body = (await request.json()) as PostBody;
  } catch {
    body = {};
  }

  const activeRef =
    body.activeLiveSession ??
    body.client?.activeLiveSession ??
    null;

  const server = await collectServerAuditSnapshot(user.id, activeRef);
  const client =
    body.client ?? collectClientAuditFromBridge() ?? null;
  const report = mergeAuditReport(server, client);

  return NextResponse.json(report);
}
