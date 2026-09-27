import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'text';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent font-medium text-white hover:bg-accent/90',
  secondary: 'border border-border bg-surface text-fg hover:bg-border',
  // Also a toggle: aria-pressed shows it as on
  text: 'text-fg-secondary underline-offset-4 hover:text-fg hover:underline aria-pressed:text-fg aria-pressed:underline',
};

// The text variant has no box, so its sizes only set the font size
const SIZES: Record<Size, string> = {
  sm: 'rounded-md px-3 py-1 text-sm',
  md: 'rounded-lg px-6 py-3',
};
const TEXT_SIZES: Record<Size, string> = {
  sm: 'text-xs',
  md: 'text-sm',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export default function Button({ variant = 'primary', size = 'md', type = 'button', className = '', ...props }: ButtonProps) {
  const sizing = variant === 'text' ? TEXT_SIZES[size] : SIZES[size];
  return (
    <button
      type={type}
      className={`${VARIANTS[variant]} ${sizing} transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
