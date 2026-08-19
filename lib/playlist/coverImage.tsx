import { ImageResponse } from "next/og";

import { PLAYLIST_COVER_BG, PLAYLIST_COVER_FG } from "@/lib/playlist/coverStyle";

const SIZE = 640;
const MAX_JPEG_BYTES = 250_000;

function wrapCoverTitle(title: string): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["Playlist"];
  const maxChars = title.length > 48 ? 12 : title.length > 28 ? 14 : 16;
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const chunk =
      word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    const next = current ? `${current} ${chunk}` : chunk;
    if (next.length <= maxChars) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = chunk;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 5);
}

export async function renderPlaylistCoverJpeg(title: string): Promise<Buffer> {
  // `sharp` is platform-specific. Import it lazily so missing linux-x64 binaries
  // don't crash unrelated endpoints (e.g. GET /api/playlists).
  const sharpMod = await import("sharp").catch(() => null);
  const sharp = sharpMod?.default;
  if (!sharp) {
    throw new Error(
      "sharp module missing (required to render playlist cover JPEG on this runtime)",
    );
  }

  const lines = wrapCoverTitle(title);
  const longest = Math.max(...lines.map((l) => l.length));
  const fontSize =
    lines.length >= 4 || longest > 14 ? 52 : lines.length === 3 ? 64 : 80;

  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: PLAYLIST_COVER_BG,
          padding: 64,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: PLAYLIST_COVER_FG,
            fontSize,
            fontWeight: 700,
            lineHeight: 1.15,
            textAlign: "center",
          }}
        >
          {lines.map((line, i) => (
            <div key={`${i}-${line}`} style={{ display: "flex" }}>
              {line}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: SIZE, height: SIZE },
  );

  const png = Buffer.from(await response.arrayBuffer());
  let jpeg = await sharp(png).jpeg({ quality: 85 }).toBuffer();
  if (jpeg.byteLength > MAX_JPEG_BYTES) {
    jpeg = await sharp(png).jpeg({ quality: 65 }).toBuffer();
  }
  return jpeg;
}
