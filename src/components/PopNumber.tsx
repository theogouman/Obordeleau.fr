'use client';

/** Kept out of the flex flow's way: a lone space would be collapsed away. */
const NBSP = '\u00a0';

type Props = {
  value: string;
  className?: string;
  /**
   * Whether the last two digits ride in behind the rest.
   *
   * Right for a price, which arrives whole and can afford to land on its
   * decimals a beat late. Wrong for a clock, where the digit that moves is the
   * last one: the delay is held on the frame before the animation, so the
   * second would go blank for a tenth of a second on every tick.
   */
  stagger?: boolean;
};

/**
 * A number that is seen changing, on number pop in (02).
 *
 * Every character is a span of its own and each one is keyed on its position
 * and on what it says. React then remounts only the characters that actually
 * changed, and only those replay the animation: a countdown going from 29:59
 * to 29:58 moves one digit, not five. Where it is asked for, the last two
 * digits carry the stagger the snippet gives, so a price lands on its decimals
 * a beat late instead of arriving all at once.
 */
export function PopNumber({ value, className, stagger = true }: Props) {
  const characters = [...value];

  // The stagger belongs to the last two digits, not to the last two
  // characters: on a price those are a decimal and a currency sign, and
  // holding the euro back reads as a stutter rather than as a flourish.
  const digits = characters.reduce<number[]>((found, character, index) => {
    if (character >= '0' && character <= '9') found.push(index);
    return found;
  }, []);

  const behind = new Map<number, string>();
  if (stagger && digits.length >= 2) behind.set(digits[digits.length - 2], '1');
  if (stagger && digits.length >= 1) behind.set(digits[digits.length - 1], '2');

  return (
    <span className={`t-digit-group is-animating ${className ?? ''}`}>
      {characters.map((character, index) => (
        <span key={`${index}-${character}`} className="t-digit" data-stagger={behind.get(index)}>
          {character === ' ' ? NBSP : character}
        </span>
      ))}
    </span>
  );
}
