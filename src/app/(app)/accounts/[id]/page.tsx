import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AccountView } from "@/components/account-view";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { getAccountDetail } from "@/lib/data";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage({ params }: PageProps<"/accounts/[id]">) {
  return (
    <div className="mx-auto max-w-md md:max-w-3xl">
      <Reveal
        fallback={
          <div className="flex flex-col gap-5">
            <Skeleton className="h-6 w-20 rounded" />
            <Skeleton className="h-44 rounded-3xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        }
      >
        <Account params={params} />
      </Reveal>
    </div>
  );
}

async function Account({ params }: { params: PageProps<"/accounts/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  await connection();
  const detail = await getAccountDetail(id);
  if (!detail) notFound();
  return <AccountView initial={detail} />;
}
