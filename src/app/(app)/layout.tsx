import { ViewTransition } from "react";
import { BottomTabBar } from "@/components/shell/bottom-tab-bar";
import { Sidebar } from "@/components/shell/sidebar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pt-[env(safe-area-inset-top)] pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-10 md:pt-10 md:pb-10">
        <ViewTransition default="vt-page">
          <div className="mx-auto w-full max-w-6xl pt-4 md:pt-0">{children}</div>
        </ViewTransition>
      </main>
      <BottomTabBar />
    </div>
  );
}
