import type { MetadataRoute } from "next";

/** Installable PWA (§2). PNG icons + offline shell + push arrive in phase 9. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ledger",
    short_name: "Ledger",
    description: "Cash, debts, investments and what's left to spend.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
