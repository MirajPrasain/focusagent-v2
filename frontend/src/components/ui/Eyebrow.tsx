import type { HTMLAttributes } from 'react';

type EyebrowProps = HTMLAttributes<HTMLParagraphElement> & {
  tone?: 'muted' | 'accent';
};

// The small monospaced caps label over a section or number
export default function Eyebrow({ tone = 'muted', className = '', ...props }: EyebrowProps) {
  return (
    <p
      className={`font-mono text-[11px] uppercase tracking-[0.14em] ${tone === 'accent' ? 'text-accent' : 'text-fg-muted'} ${className}`}
      {...props}
    />
  );
}
