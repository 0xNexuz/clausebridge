import Pixel from '@/components/art/Pixel';
import { COUCH } from '@/components/art/pixel-maps';
import './landing.css';

export default function NotFound() {
  return (
    <main className="lost">
      <Pixel art={COUCH} scale={9} className="lost-art" title="A pixel-art contract page relaxing on a couch with a mug of coffee" groups={{ x: 'steam' }} />
      <h1 className="lost-code">ERROR 404</h1>
      <p className="lost-line">Clause not found</p>
      <p className="lost-hint">This page isn’t in the contract. It may have moved, or the link is wrong.</p>
      <a className="pill" href="/app">Back to your contracts</a>
    </main>
  );
}
