interface ManualIndicatorProps {
  label?: string;
  className?: string;
}

export default function ManualIndicator({
  label = 'Manual',
  className = '',
}: ManualIndicatorProps) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap text-[11px] font-medium uppercase leading-none tracking-[0.06em] text-gray-500 ${className}`}
    >
      <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}
