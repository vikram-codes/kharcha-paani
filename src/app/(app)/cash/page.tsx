import type { Metadata } from "next";
import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

export const metadata: Metadata = { title: "Cash" };

export default function Page() {
  return (
    <ScreenPlaceholder title="Cash" phase={4}>
      <p className="text-sm text-muted-foreground">Bank accounts (chequing + savings) and the hidden emergency fund.</p>
    </ScreenPlaceholder>
  );
}
