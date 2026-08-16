import React, { useEffect, useState } from 'react';

interface TickerDigitProps {
  digit: string;
  delayMs?: number;
  durationMs?: number;
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ROLL_DIGITS = Array.from({ length: 30 }, (_, index) => DIGITS[index % 10]);
const ROLL_OFFSET = 10;
const DIGIT_HEIGHT_EM = 1.15;

/**
 * Individual odometer digit.
 * Keeps its current position so each digit moves in the sensible direction
 * when the value changes instead of always starting at zero and moving up.
 */
const TickerDigit: React.FC<TickerDigitProps> = ({
  digit,
  delayMs = 0,
  durationMs = 600,
}) => {
  const targetIndex = DIGITS.indexOf(digit);
  const [position, setPosition] = useState<number>(() =>
    targetIndex >= 0 ? ROLL_OFFSET + targetIndex : ROLL_OFFSET,
  );
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (targetIndex < 0) return;

    const currentDigit = ((position % 10) + 10) % 10;

    // If the digit has not changed, leave it completely still.
    if (currentDigit === targetIndex) {
      setIsAnimating(false);
      return;
    }

    let delta = targetIndex - currentDigit;

    // Pick the shortest direction around the 0-9 odometer cycle.
    // 5 -> 9 = up, 2 -> 1 = down, 9 -> 8 = down, 9 -> 0 = up.
    if (delta > 5) delta -= 10;
    if (delta < -5) delta += 10;

    const nextPosition = position + delta;

    const animationTimer = window.setTimeout(() => {
      setIsAnimating(true);
      setPosition(nextPosition);
    }, delayMs);

    // Keep the completion timer independent of `position`. The previous
    // implementation included position in this effect's dependency list,
    // which caused the cleanup to cancel this timer immediately after the
    // position changed and left the digit permanently marked as animating.
    const finishTimer = window.setTimeout(() => {
      setIsAnimating(false);
    }, delayMs + durationMs + 40);

    return () => {
      window.clearTimeout(animationTimer);
      window.clearTimeout(finishTimer);
    };
  }, [targetIndex, delayMs, durationMs]);

  if (targetIndex === -1) {
    return (
      <span className="inline-flex items-center justify-center h-[1.15em] leading-[1.15em] select-none text-current">
        {digit}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center relative overflow-hidden h-[1.15em] leading-[1.15em] select-none text-current"
      style={{ width: '0.62em', textAlign: 'center' }}
    >
      <span
        className="inline-flex flex-col absolute left-0 right-0 top-0 will-change-transform"
        style={{
          // Translate by one digit's actual height, not by a percentage of
          // the entire 30-digit strip. This prevents the ticker from landing
          // between rows and exposing blank/partial values such as "$ .".
          transform: `translateY(-${position * DIGIT_HEIGHT_EM}em)`,
          transition: isAnimating
            ? `transform ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`
            : 'none',
        }}
      >
        {ROLL_DIGITS.map((d, index) => (
          <span
            key={`${d}-${index}`}
            className="h-[1.15em] leading-[1.15em] flex items-center justify-center select-none text-current"
          >
            {d}
          </span>
        ))}
      </span>
    </span>
  );
};

export interface TickerNumberProps {
  value: string | number;
  className?: string;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  staggerMs?: number;
  refreshTrigger?: any;
}

/**
 * Universal Rolling / Odometer Ticker Counter.
 * Each digit remembers its previous position and only animates when its value
 * actually changes. Rendering the same value again does not replay the ticker.
 */
export const TickerNumber: React.FC<TickerNumberProps> = ({
  value,
  className = '',
  prefix = '',
  suffix = '',
  durationMs = 700,
  staggerMs = 30,
}) => {
  const rawStr = String(value ?? '0');
  const fullStr = `${prefix}${rawStr}${suffix}`;
  const chars = fullStr.split('');

  return (
    <span className={`inline-flex items-center font-mono leading-none tracking-tight ${className}`}>
      {chars.map((char, index) => {
        const isDigit = /\d/.test(char);
        if (!isDigit) {
          const isNarrow = char === '.' || char === ',';
          const isSpace = char === ' ';
          const isSymbol = char === '$' || char === '€' || char === '£' || char === '¥' || char === '₹';

          return (
            <span
              key={`char-${index}`}
              className="inline-flex items-center justify-center h-[1.15em] leading-[1.15em] select-none text-current"
              style={{
                width: isNarrow ? '0.32em' : isSpace ? '0.3em' : isSymbol ? '0.62em' : 'auto',
                textAlign: 'center',
              }}
            >
              {char}
            </span>
          );
        }

        return (
          <TickerDigit
            key={`digit-${index}`}
            digit={char}
            delayMs={index * staggerMs}
            durationMs={durationMs}
          />
        );
      })}
    </span>
  );
};

export default TickerNumber;
