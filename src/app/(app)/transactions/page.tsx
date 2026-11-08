import type { Metadata } from "next";
import { TransactionsPage } from "@/components/transactions/transactions-page";

export const metadata: Metadata = { title: "Transactions" };

export default function Page() {
  return <TransactionsPage month={Promise.resolve(undefined)} />;
}
