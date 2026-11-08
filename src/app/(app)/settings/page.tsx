import type { Metadata } from "next";
import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <ScreenPlaceholder title="Settings" phase={1}>
      <p className="text-sm text-muted-foreground">Accounts, paycheque, categories, rules and tokens.</p>
    </ScreenPlaceholder>
  );
}
