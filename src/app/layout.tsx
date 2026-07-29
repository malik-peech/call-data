import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Call Data",
  description: "Centralise, catégorise et interroge les calls commerciaux et réunions projet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
