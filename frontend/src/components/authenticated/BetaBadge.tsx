/** Marks a feature that is open to everyone but still settling. */
export default function BetaBadge({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const colors = tone === 'dark'
    ? 'border-white/20 text-white/70'
    : 'border-[#102319]/15 bg-[#d9ff6f]/60 text-[#173c2c]';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-[0.12em] ${colors}`}>
      Beta
    </span>
  );
}
