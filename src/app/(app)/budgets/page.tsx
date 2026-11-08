import type { Metadata } from "next";
import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

export const metadata: Metadata = { title: "Budgets" };

export default function Page() {
  return (
    <ScreenPlaceholder title="Budgets" phase={5}>
      <p className="text-sm text-muted-foreground">Monthly budgets by category with green, yellow, orange and red bands.</p>
    </ScreenPlaceholder>
  );
}
