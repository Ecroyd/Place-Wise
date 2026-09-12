import type { Metadata } from "next";
import { Manrope, Instrument_Serif } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const sans = Manrope({ variable: "--font-sans", subsets: ["latin"] });
const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Placewise — Find where life fits",
  description: "Transparent location recommendations shaped around your real life.",
  icons: { icon: "/favicon.svg" },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: { title:"Placewise — Find where life fits", description:"Transparent location recommendations shaped around your real life.", images:["/og.png"] },
  twitter: { card:"summary_large_image", title:"Placewise — Find where life fits", description:"Transparent location recommendations shaped around your real life.", images:["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${sans.variable} ${serif.variable}`}>{children}</body></html>;
}
