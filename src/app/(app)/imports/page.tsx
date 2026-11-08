import type { Metadata } from "next";
import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

export const metadata: Metadata = { title: "Imports" };

export default function Page() {
  return (
    <ScreenPlaceholder title="Imports" phase={3}>
      <p className="text-sm text-muted-foreground">Upload statements and review them before saving.</p>
    </ScreenPlaceholder>
  );
}
