// The on/off track shown inside a toggle button. Decorative: the button carries aria-pressed
export default function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-block h-[18px] w-[30px] shrink-0 rounded-full transition-colors duration-200 ${on ? 'bg-accent' : 'bg-border-strong'}`}
    >
      <span
        className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all duration-200 ${on ? 'left-[14px] bg-page' : 'left-0.5 bg-fg-muted'}`}
      />
    </span>
  );
}
