import type { Metadata } from "next";
import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

export const metadata: Metadata = { title: "Goals" };

export default function Page() {
  return (
    <ScreenPlaceholder title="Goals" phase={6}>
      <p className="text-sm text-muted-foreground">Savings goals and monthly contributions.</p>
    </ScreenPlaceholder>
  );
}
