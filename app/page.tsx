import type { Metadata } from 'next';
import Landing from '@/components/landing/Landing';
import './landing.css';

export const metadata: Metadata = {
  title: 'ClauseBridge: every promise, tracked to the clause',
  description: 'Turn contracts into confirmed deadlines, deliverables and payment schedules, built on Univer Docs and Univer Sheets with Ling 3.2 Flash.',
};

export default function Home() { return <Landing />; }
