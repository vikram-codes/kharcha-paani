import type { Metadata } from "next";
import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

export const metadata: Metadata = { title: "Transactions" };

export default function Page() {
  return (
    <ScreenPlaceholder title="Transactions" phase={4}>
      <p className="text-sm text-muted-foreground">Every transaction, grouped by day, with upcoming bills greyed at the top.</p>
    </ScreenPlaceholder>
  );
}
