import type { Metadata } from "next";
import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

export const metadata: Metadata = { title: "Debts" };

export default function Page() {
  return (
    <ScreenPlaceholder title="Debts" phase={4}>
      <p className="text-sm text-muted-foreground">Credit cards, the student loan and Affirm plans.</p>
    </ScreenPlaceholder>
  );
}
