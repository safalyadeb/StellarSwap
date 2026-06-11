export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-white/30 border-t-white animate-spin ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
