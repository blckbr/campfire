import { useEffect, useMemo, useState } from "react";

type Props = {
  expiresAt: string;
};

type Segment = "a" | "b" | "c" | "d" | "e" | "f" | "g";

const DIGIT_SEGMENTS: Readonly<Record<string, readonly Segment[]>> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "d", "e", "g"],
  "3": ["a", "b", "c", "d", "g"],
  "4": ["b", "c", "f", "g"],
  "5": ["a", "c", "d", "f", "g"],
  "6": ["a", "c", "d", "e", "f", "g"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
};

const ALL_SEGMENTS: readonly Segment[] = ["a", "b", "c", "d", "e", "f", "g"];

function secondsUntil(iso: string): number {
  const deadline = Date.parse(iso);
  if (!Number.isFinite(deadline)) return 0;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

function formatRemaining(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function detectTwentyFourFont(): boolean {
  if (!document.fonts.check('72px "Twenty Four"')) return false;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return false;
  const sample = "0123456789:24";
  context.font = '72px monospace';
  const fallbackWidth = context.measureText(sample).width;
  context.font = '72px "Twenty Four", monospace';
  const candidateWidth = context.measureText(sample).width;
  return Math.abs(candidateWidth - fallbackWidth) > 0.5;
}

function TwentyFourFallback({ value }: { value: string }) {
  return (
    <span className="campfireTwentyFourSegments" aria-hidden="true">
      {[...value].map((char, index) => {
        if (char === ":") {
          return (
            <span className="campfireTwentyFourColon" key={`colon-${index}`}>
              <i />
              <i />
            </span>
          );
        }
        const active = new Set(DIGIT_SEGMENTS[char] ?? []);
        return (
          <span className="campfireTwentyFourDigit" key={`${char}-${index}`}>
            {ALL_SEGMENTS.map((segment) => (
              <i
                key={segment}
                className={`campfireTwentyFourSegment campfireTwentyFourSegment--${segment}${active.has(segment) ? " is-on" : ""}`}
              />
            ))}
          </span>
        );
      })}
    </span>
  );
}

export default function CampfireExpiryCountdown({ expiresAt }: Props) {
  const [remainingSeconds, setRemainingSeconds] = useState(() => secondsUntil(expiresAt));
  const [twentyFourFontAvailable, setTwentyFourFontAvailable] = useState(false);

  useEffect(() => {
    setRemainingSeconds(secondsUntil(expiresAt));
    const timer = window.setInterval(() => {
      setRemainingSeconds(secondsUntil(expiresAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    let cancelled = false;
    const fontSet = document.fonts;
    const checkFont = () => {
      if (!cancelled) setTwentyFourFontAvailable(detectTwentyFourFont());
    };
    void fontSet.ready.then(checkFont, checkFont);
    return () => { cancelled = true; };
  }, []);

  const tone = useMemo(() => {
    if (remainingSeconds <= 60) return "campfireExpiryCountdown--red";
    if (remainingSeconds <= 240) return "campfireExpiryCountdown--yellow";
    return "campfireExpiryCountdown--green";
  }, [remainingSeconds]);

  const label = formatRemaining(remainingSeconds);

  return (
    <div className={`campfireExpiryCountdown ${tone}`} role="timer" aria-live="polite" aria-label={`Campfire vazia, será apagada em ${label}`}>
      <div className="campfireExpiryCountdownValue" aria-hidden="true">
        {twentyFourFontAvailable ? (
          <span className="campfireExpiryCountdownText">{label}</span>
        ) : (
          <TwentyFourFallback value={label} />
        )}
      </div>
      <p className="campfireExpiryCountdownLabel">
        Campfire vazia — será apagada em {label}
      </p>
    </div>
  );
}
