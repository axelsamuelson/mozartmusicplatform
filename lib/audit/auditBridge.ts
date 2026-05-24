import type { AuditClientSnapshot } from "@/lib/audit/types";

type Provider = () => AuditClientSnapshot | null;

let provider: Provider | null = null;

export function registerAuditClientProvider(fn: Provider): void {
  provider = fn;
}

export function unregisterAuditClientProvider(): void {
  provider = null;
}

export function collectClientAuditFromBridge(): AuditClientSnapshot | null {
  return provider?.() ?? null;
}
