"use client";

import { ErrorScreen } from "@/components/error-screen";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

/** The root layout itself crashed: same screen, in its own document. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en-CA" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <title>Something broke · Kharcha-Paani</title>
        <ThemeProvider>
          <ErrorScreen error={error} retry={retry} />
        </ThemeProvider>
      </body>
    </html>
  );
}
