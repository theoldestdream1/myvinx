import logo from '@/assets/vinx-logo-header.png.asset.json';

export function GemMark({ className = 'h-8 w-8' }: { className?: string; textClass?: string }) {
  return (
    <img src={logo.url} alt="Vinx logo" width={256} height={256} className={`${className} shrink-0 rounded-sm object-contain`} />
  );
}
