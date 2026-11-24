import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getWebinar, WEBINARS } from "@/lib/config";
import Landing from "./Landing";

export async function generateMetadata({ params }: PageProps<"/w/[slug]">): Promise<Metadata> {
  const w = getWebinar((await params).slug);
  return w
    ? { title: `${w.title} · ${w.brand}`, description: w.subtitle, openGraph: { title: w.title, description: w.subtitle } }
    : {};
}

export function generateStaticParams() {
  return Object.keys(WEBINARS).map((slug) => ({ slug }));
}

export default async function Page({ params }: PageProps<"/w/[slug]">) {
  const w = getWebinar((await params).slug);
  if (!w) notFound();
  return <Landing w={w} />;
}
