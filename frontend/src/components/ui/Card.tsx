import type { HTMLAttributes } from 'react';

const PADDING = {
  sm: 'px-3 py-3',
  md: 'p-5',
};

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: keyof typeof PADDING;
};

export default function Card({ padding = 'md', className = '', ...props }: CardProps) {
  return <div className={`rounded-xl border border-border bg-surface ${PADDING[padding]} ${className}`} {...props} />;
}
