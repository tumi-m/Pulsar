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
      <rect
        x="3"
        y="5.5"
        width="18"
        height="13"
        rx="1.6"
        fill="currentColor"
        fillOpacity={filled ? 0.22 : 0}
        stroke="currentColor"
        strokeWidth="1.7"
      />
      {/* cross-brace slats */}
      <path
        d="M3 5.5l18 13M21 5.5L3 18.5M3 12h18"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}
