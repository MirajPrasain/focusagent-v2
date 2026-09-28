import type { HTMLAttributes } from 'react';

const PADDING = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-7',
};

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: keyof typeof PADDING;
};

export default function Card({ padding = 'md', className = '', ...props }: CardProps) {
  return <div className={`rounded-2xl border border-border bg-surface/80 ${PADDING[padding]} ${className}`} {...props} />;
}
