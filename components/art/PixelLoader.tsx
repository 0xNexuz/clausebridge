import Pixel from './Pixel';
import { READER } from './pixel-maps';

/** Loading state: the pixel reader, bobbing while the Univer editor opens. */
export default function PixelLoader({ label }: { label: string }) {
  return (
    <div className="pixel-loader" role="status">
      <Pixel art={READER} scale={3} />
      <span>{label}<span className="dots" /></span>
    </div>
  );
}
