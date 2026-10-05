import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { siteUrl } from '@/lib/site-config'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});


export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'GitToSkill',
    template: '%s | GitToSkill',
  },
  description:
    'Turn public GitHub code into a practical coding skill, with cited observations and clear evidence scope.',
  openGraph: {
    type: 'website',
    siteName: 'GitToSkill',
    title: 'GitToSkill',
    description:
      'Turn public GitHub code into a practical coding skill, with cited observations and clear evidence scope.',
    url: siteUrl,
  },
  twitter: {
    card: 'summary',
    title: 'GitToSkill',
    description:
      'Turn public GitHub code into a practical coding skill, with cited observations and clear evidence scope.',
  },
  other: {
    'impact-site-verification': '3e794e36-073b-4491-8b78-228e7d4d390c',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-blue-700 focus:px-4 focus:py-2 focus:text-white focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
        >
          Skip to main content
        </a>
        {children}
        {process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true' ? <Analytics /> : null}
      </body>
    </html>
  );
}
