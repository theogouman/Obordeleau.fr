import { localeFlags } from '@/i18n/routing';

/**
 * Measured once per page: a system without a flag font paints a regional
 * indicator pair as two letter boxes, which would read as a bug next to three
 * real flags. The French flag is drawn on a canvas in black text and the
 * pixels are read back. A painted flag brings its blue stripe, the fallback
 * brings black only, and the switcher then keeps the language codes.
 *
 * The answer lives here rather than in one component because the header and
 * the footer both ask for it: two caches would mean two canvases and, worse,
 * two chances for one of them to flash the codes before the flags.
 */
let flagSupport: boolean | undefined;

export function supportsFlagEmoji(): boolean {
  if (flagSupport !== undefined) return flagSupport;

  flagSupport = false;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (context) {
      context.textBaseline = 'top';
      context.font = '20px sans-serif';
      context.fillStyle = '#000000';
      context.fillText(localeFlags.fr, 0, 0);

      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < data.length; index += 4) {
        const isPainted = data[index + 3] > 96;
        const isBlue = data[index + 2] > data[index] + 48;
        if (isPainted && isBlue) {
          flagSupport = true;
          break;
        }
      }
    }
  } catch {
    flagSupport = false;
  }

  return flagSupport;
}

/** What the probe already knows, for a first render that does not flash. */
export function knownFlagSupport(): boolean {
  return flagSupport === true;
}
