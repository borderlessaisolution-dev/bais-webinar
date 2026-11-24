import { notFound } from "next/navigation";
import { getWebinar, WEBINARS } from "@/lib/config";
import Checkout from "./Checkout";

export async function generateMetadata({ params }: PageProps<"/checkout/[slug]">) {
  const w = getWebinar((await params).slug);
  return { title: w ? `报名 · ${w.offer.title}` : "报名" };
}

export function generateStaticParams() {
  return Object.keys(WEBINARS).map((slug) => ({ slug }));
}

export default async function Page({ params }: PageProps<"/checkout/[slug]">) {
  const w = getWebinar((await params).slug);
  if (!w) notFound();
  return <Checkout w={w} />;
}
