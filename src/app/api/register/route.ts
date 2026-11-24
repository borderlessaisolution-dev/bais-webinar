import { NextResponse } from "next/server";
import { getWebinar } from "@/lib/config";
import { bad, signAttendee } from "@/lib/server";
import { normPhone, store } from "@/lib/store";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const slug = String(b.slug ?? "");
  if (!getWebinar(slug)) return bad("Webinar 不存在", 404);

  const name = String(b.name ?? "").trim().slice(0, 60);
  const email = String(b.email ?? "").trim().toLowerCase().slice(0, 120);
  const phone = normPhone(String(b.phone ?? ""));
  const country = b.country === "SG" ? "SG" : "MY";
  if (name.length < 2) return bad("请填写名字");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Email 格式不对");
  if (phone.length < 9 || phone.length > 15) return bad("WhatsApp 号码不对");

  const reg = await store().addRegistration({
    webinar_slug: slug,
    name,
    email,
    phone,
    country,
    interest: b.interest ? String(b.interest).slice(0, 80) : null,
    utm_source: b.utm_source ? String(b.utm_source).slice(0, 80) : null,
    utm_campaign: b.utm_campaign ? String(b.utm_campaign).slice(0, 120) : null,
  });
  return NextResponse.json({ id: reg.id, name: reg.name, pass: signAttendee(reg.id) });
}
