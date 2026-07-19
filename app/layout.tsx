import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import PoweredBy from "@/components/powered-by";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SVS Vault",
  description: "Secure passwords and documents for SVS teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="flex-1 flex flex-col min-h-0">{children}</div>
        <PoweredBy />
      </body>
    </html>
  );
}
