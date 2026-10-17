import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import Navbar from '@/components/Navbar';
import { getSessionUser } from '@/lib/auth';
import './globals.css';

// One variable family; headings use its condensed width axis, body text the normal width
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });

export const metadata: Metadata = {
  title: 'PESU-Sync',
  description: 'Find teammates and form teams for hackathons, coursework and capstones at PES University',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-screen font-sans">
        <Navbar user={user} />
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-sm text-slate-500 sm:px-6">
          PESU-Sync is a UE24CS351A DBMS project, built on PostgreSQL, Qdrant and Next.js.
        </footer>
      </body>
    </html>
  );
}
