import { notFound } from "next/navigation";
import { getWebinar, WEBINARS } from "@/lib/config";
import Classroom from "./Classroom";

export async function generateMetadata({ params }: PageProps<"/live/[slug]">) {
  const w = getWebinar((await params).slug);
  return { title: w ? `🔴 直播教室 · ${w.title}` : "直播教室" };
}

export function generateStaticParams() {
  return Object.keys(WEBINARS).map((slug) => ({ slug }));
}

export default async function Page({ params }: PageProps<"/live/[slug]">) {
  const w = getWebinar((await params).slug);
  if (!w) notFound();
  return <Classroom w={w} />;
}
