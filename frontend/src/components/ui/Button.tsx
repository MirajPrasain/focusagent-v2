import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'text';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-fg font-medium text-page hover:bg-white',
  // Also a choice or toggle: aria-pressed shows it as selected
  secondary: 'border border-border text-fg-secondary hover:border-border-strong hover:text-fg '
    + 'aria-pressed:border-accent aria-pressed:bg-accent/10 aria-pressed:text-fg',
  // Also a toggle: aria-pressed shows it as on
  text: 'text-fg-secondary underline-offset-4 hover:text-fg hover:underline aria-pressed:text-fg',
};

// The text variant has no box, so its sizes only set the font size
const SIZES: Record<Size, string> = {
  sm: 'h-9 rounded-lg px-3 text-sm',
  md: 'h-11 rounded-[10px] px-4 text-sm',
  lg: 'h-14 rounded-xl px-6 text-base',
};
const TEXT_SIZES: Record<Size, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
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
      className={`inline-flex items-center justify-center gap-2 ${VARIANTS[variant]} ${sizing} transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...props}
    />
  );
}
