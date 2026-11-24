import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import type { Activity, PublicActivity } from "./types";

const SECRET = () => process.env.APP_SECRET || process.env.LIVEKIT_API_SECRET || "dev-secret";

/** 学员凭证：attendeeId.签名，防止别人冒名作答 */
export function signAttendee(id: string) {
  const sig = createHmac("sha256", SECRET()).update(id).digest("base64url").slice(0, 22);
  return `${id}.${sig}`;
}
export function verifyAttendee(pass: string | undefined | null): string | null {
  if (!pass) return null;
  const [id, sig] = pass.split(".");
  if (!id || !sig) return null;
  const good = signAttendee(id).split(".")[1];
  const a = Buffer.from(sig);
  const b = Buffer.from(good);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export function isHost(req: Request) {
  const key = req.headers.get("x-host-key");
  // 正式环境一定要设 HOST_KEY；本地没设时用 host123
  const want = process.env.HOST_KEY || (process.env.NODE_ENV === "production" ? "" : "host123");
  if (!want) return false;
  return !!key && key === want;
}

export function roomName(slug: string) {
  return `webinar-${slug}`;
}

export async function livekitToken(opts: {
  slug: string;
  identity: string;
  name: string;
  host: boolean;
}) {
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY || "devkey",
    process.env.LIVEKIT_API_SECRET || "secret",
    { identity: opts.identity, name: opts.name, ttl: "6h" }
  );
  at.addGrant({
    room: roomName(opts.slug),
    roomJoin: true,
    canSubscribe: true,
    canPublish: opts.host, // 只有老师能开镜头/麦克风
    canPublishData: true, // 学员可打字、发表情
  });
  return {
    token: await at.toJwt(),
    url: process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880",
  };
}

export function toPublic(a: Activity): PublicActivity {
  return { id: a.id, type: a.type, question: a.question, options: a.options, duration_sec: a.duration_sec };
}

export function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}
