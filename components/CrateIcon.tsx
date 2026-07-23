/**
 * A small wooden-crate glyph — a rounded box with cross-bracing slats.
 * Used as the "in crate" indicator (brown) in place of a plain checkmark.
 */
export function CrateIcon({
  size = 16,
  className = "",
  filled = false,
}: {
  size?: number;
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* basket body — a woven trapezoid crate (wider at the top) */}
      <path
        d="M5 8 L6.6 19.4 A1.1 1.1 0 0 0 7.7 20.3 H16.3 A1.1 1.1 0 0 0 17.4 19.4 L19 8 Z"
        fill="currentColor"
        fillOpacity={filled ? 0.22 : 0}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* top rim */}
      <path d="M3.4 8 H20.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      {/* woven slats — verticals + a horizontal band */}
      <path
        d="M9.3 8.6 L10 20 M12 8.6 V20 M14.7 8.6 L14 20 M5.9 13.8 H18.1"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
