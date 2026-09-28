import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

// Pulseboard design system (D-020): https://claude.ai/artifact/7D65arDGpQEq88bpyT6eWa
// Named to not collide with the --font-* tokens in globals.css, which append the
// design system's own literal fallback stack after these.
const display = IBM_Plex_Sans_Condensed({ subsets: ['latin'], weight: '600', variable: '--ibm-plex-sans-condensed' });
const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '600'], variable: '--ibm-plex-sans' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--ibm-plex-mono' });

export const metadata = { title: 'Pulseboard' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="pb-root">{children}</body>
    </html>
  );
}
