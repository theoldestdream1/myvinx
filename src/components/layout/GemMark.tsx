export function GemMark({ className = 'h-8 w-8', textClass = 'text-sm' }: { className?: string; textClass?: string }) {
  return (
    <div className={`${className} relative flex items-center justify-center`}>
      <div className="absolute inset-0 rotate-45 rounded-[28%] bg-gradient-to-br from-primary via-primary/40 to-transparent opacity-90" />
      <div className="absolute inset-[2px] rotate-45 rounded-[26%] bg-background/80" />
      <span className={`relative font-display italic text-primary leading-none translate-y-px ${textClass}`}>V</span>
    </div>
  );
}
