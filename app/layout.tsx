import type { Metadata } from 'next';
import './torn.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'ClauseBridge',
  description: 'Turn contracts into confirmed obligations, deadlines and payment schedules, built on Univer.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
