import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PESU-Sync',
  description: 'Campus Events & Capstone Teaming Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
