/**
 * The Ask Linc "L" mark, for headers and footers drawn with Tailwind.
 *
 * The marketing shell draws the same mark in CSS (`.brand-mark` in
 * `marketing/SiteShell`); this is its counterpart everywhere else, so a page
 * that builds its own header cannot fall behind the brand again.
 */
const SIZES = {
  sm: 'h-7 w-7 text-base rounded-[8px_8px_8px_2px]',
  md: 'h-9 w-9 text-lg rounded-[10px_10px_10px_3px]',
} as const;

export default function BrandMark({ size = 'md' }: { size?: keyof typeof SIZES }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center bg-[#102319] font-bold text-[#d9ff6f] ${SIZES[size]}`}
    >
      L
    </span>
  );
}
