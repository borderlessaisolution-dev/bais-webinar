import { NextResponse } from "next/server";
import { bad, isHost, livekitToken } from "@/lib/server";

export async function POST(req: Request) {
  if (!isHost(req)) return bad("Host key 不对", 401);
  const b = await req.json().catch(() => ({}));
  const lk = await livekitToken({
    slug: String(b.slug ?? ""),
    identity: "host",
    name: String(b.name || "老师"),
    host: true,
  });
  return NextResponse.json(lk);
}
