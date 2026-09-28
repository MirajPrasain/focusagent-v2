export type SegmentTone = 'focused' | 'distracted' | 'away';

// One stretch of the bar, in percent of its width
export type BarSegment = { key: string | number; left: number; width: number; tone: SegmentTone };

const TONES: Record<SegmentTone, string> = {
  focused: 'bg-accent',
  distracted: 'bg-distracted',
  away: 'bg-away',
};

// Colored stretches on an empty track, each with rounded ends and a hairline gap from its neighbors. Used by the
// session's focus bar and the summary's timeline. `className` sets the height and the track's corner radius
export default function SegmentBar({ segments, className = 'h-2 rounded-full', segmentClassName = 'rounded-full' }:
  { segments: BarSegment[]; className?: string; segmentClassName?: string }) {
  return (
    <div className={`relative overflow-hidden bg-border ${className}`}>
      {segments.map((segment) => (
        <div
          key={segment.key}
          className={`absolute inset-y-0 ${TONES[segment.tone]} ${segmentClassName}`}
          // Trims 1px off each side for the gap, but never below a sliver
          style={{ left: `calc(${segment.left}% + 1px)`, width: `max(2px, calc(${segment.width}% - 2px))` }}
        />
      ))}
    </div>
  );
}
