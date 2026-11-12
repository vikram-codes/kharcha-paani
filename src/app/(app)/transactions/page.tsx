import type { Metadata } from "next";
import { TransactionsPage } from "@/components/transactions/transactions-page";

export const metadata: Metadata = { title: "Transactions" };

export default function Page({ searchParams }: PageProps<"/transactions">) {
  // ?tx=<id>: open that transaction (an Apple Pay notification was tapped).
  const openId = searchParams.then((p) => (typeof p.tx === "string" ? p.tx : undefined));
  return <TransactionsPage month={Promise.resolve(undefined)} openId={openId} />;
}
