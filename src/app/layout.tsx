import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Mailer",
    template: "%s · Mailer",
  },
  description: "Email campaigns, customized mails and transactional email for ABTalks and Klymb.",
  robots: { index: false, follow: false },
};

// Applies the saved theme (light / dark / system) before first paint, so a
// dark-mode user never sees a white flash. Kept tiny and dependency-free.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("mailer:theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
