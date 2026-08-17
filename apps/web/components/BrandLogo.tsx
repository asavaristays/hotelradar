type Variant = "lockup" | "mark" | "mark-micro";

const SRC: Record<Variant, { src: string; w: number; h: number }> = {
  lockup: { src: "/brand/hotelradar-lockup-horizontal.svg", w: 320, h: 66 },
  mark: { src: "/brand/hotelradar-mark.svg", w: 68, h: 94 },
  "mark-micro": { src: "/brand/hotelradar-mark-micro.svg", w: 32, h: 32 },
};

export function BrandLogo({
  variant = "lockup",
  className = "",
  priority = false,
}: {
  variant?: Variant;
  className?: string;
  priority?: boolean;
}) {
  const asset = SRC[variant];
  return (
    // SVG lockups from brand kit — use native img for crisp vector rendering
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset.src}
      alt="HotelRADAR"
      width={asset.w}
      height={asset.h}
      className={`brand-logo ${className}`.trim()}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  );
}
