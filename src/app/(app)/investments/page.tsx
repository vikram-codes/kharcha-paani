import type { Metadata } from "next";
import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

export const metadata: Metadata = { title: "Investments" };

export default function Page() {
  return (
    <ScreenPlaceholder title="Investments" phase={4}>
      <p className="text-sm text-muted-foreground">Investment accounts you update by hand.</p>
    </ScreenPlaceholder>
  );
}
