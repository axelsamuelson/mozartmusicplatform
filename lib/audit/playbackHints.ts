let lastCircuitHeader: string | null = null;

export function setLastPlaybackCircuitHeader(value: string | null): void {
  lastCircuitHeader = value;
}

export function getLastPlaybackCircuitHeader(): string | null {
  return lastCircuitHeader;
}
