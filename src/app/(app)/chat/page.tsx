import type { Metadata } from "next";
import { ScreenPlaceholder } from "@/components/shell/screen-placeholder";

export const metadata: Metadata = { title: "Chat" };

export default function Page() {
  return (
    <ScreenPlaceholder title="Chat" phase={7}>
      <p className="text-sm text-muted-foreground">Your finance assistant: ask questions or log spending in plain language.</p>
    </ScreenPlaceholder>
  );
}
