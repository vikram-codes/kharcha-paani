import type { Metadata } from "next";
import { TransactionsPage } from "@/components/transactions/transactions-page";

export const metadata: Metadata = { title: "Transactions" };

export default function Page({ params }: PageProps<"/transactions/[month]">) {
  return <TransactionsPage month={params.then((p) => p.month)} />;
}
