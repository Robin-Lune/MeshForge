import type { Metadata } from "next";
import { Syne, Space_Mono } from "next/font/google";
import "./globals.css";
import Footer from "@/components/Footer";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "MeshForge — Carte du réseau LoRa 974",
  description:
    "Monitoring temps réel et historique du réseau LoRa Meshtastic de La Réunion : couverture, nodes, télémétrie.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`dark ${syne.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col font-sans">
        {children}
        <Footer />
      </body>
    </html>
  );
}
