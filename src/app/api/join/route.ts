import { NextResponse } from "next/server";
import { getWebinar } from "@/lib/config";
import { bad, livekitToken, signAttendee, verifyAttendee } from "@/lib/server";
import { store } from "@/lib/store";

/** 进入直播教室：用 pass（之前报名存在手机里的）或 电话/Email 查报名记录，换 LiveKit token */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const slug = String(b.slug ?? "");
  if (!getWebinar(slug)) return bad("Webinar 不存在", 404);

  const s = store();
  let reg = null;
  const id = verifyAttendee(b.pass);
  if (id) reg = await s.getRegistration(id);
  if (!reg && b.contact) reg = await s.findRegistration(slug, String(b.contact));
  if (!reg || reg.webinar_slug !== slug) return bad("找不到报名记录", 404);

  await s.markJoined(reg.id);
  const lk = await livekitToken({ slug, identity: reg.id, name: reg.name, host: false });
  return NextResponse.json({ ...lk, name: reg.name, id: reg.id, pass: signAttendee(reg.id) });
}
