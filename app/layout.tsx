import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Wilber Makia — Gánate una XTZ 660 0-KM",
  description:
    "Rifa en vivo de una moto XTZ 660 0-KM. Compra tus números por Nequi y participa por $50.000 extra si tienes un número bendecido.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${anton.variable} ${inter.variable} h-full antialiased scroll-smooth`}>
      <body className="min-h-full flex flex-col bg-charcoal text-cream">{children}</body>
    </html>
  );
}
