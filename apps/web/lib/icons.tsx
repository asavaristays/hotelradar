import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

function base(size: number, className: string | undefined, children: ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function RadarLogo({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.8" opacity="0.85" />
      <path
        d="M12 2v3M12 19v3M2 12h3M19 12h3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconBed({ size = 20, className }: IconProps) {
  return base(
    size,
    className,
    <>
      <path d="M3 18V9a2 2 0 0 1 2-2h5v7H3zM10 14h11v4H10z" />
      <path d="M10 10h9a2 2 0 0 1 2 2v2" />
      <path d="M3 18h18" />
    </>
  );
}

export function IconPeople({ size = 20, className }: IconProps) {
  return base(
    size,
    className,
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M2.5 19c.8-3 3-4.5 6.5-4.5S15 16 15.8 19" />
      <path d="M15 14.5c2.2.2 3.8 1.2 4.5 3.5" />
    </>
  );
}

export function IconHandshake({ size = 20, className }: IconProps) {
  return base(
    size,
    className,
    <>
      <path d="M4 14l4-4 3 3 4-4 5 5" />
      <path d="M8 10V7a2 2 0 0 1 2-2h1" />
      <path d="M16 10V8a2 2 0 0 0-2-2h-1" />
      <path d="M3 18h6M15 18h6" />
    </>
  );
}

export function IconBook({ size = 20, className }: IconProps) {
  return base(
    size,
    className,
    <>
      <path d="M4 5a2 2 0 0 1 2-2h11v16H6a2 2 0 0 0-2 2V5z" />
      <path d="M17 3v16" />
      <path d="M8 8h5M8 12h5" />
    </>
  );
}

export function IconHeadset({ size = 20, className }: IconProps) {
  return base(
    size,
    className,
    <>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="2.5" y="13" width="4" height="6" rx="1.5" />
      <rect x="17.5" y="13" width="4" height="6" rx="1.5" />
      <path d="M18 19v1a3 3 0 0 1-3 3h-2" />
    </>
  );
}

export function IconDoc({ size = 20, className }: IconProps) {
  return base(
    size,
    className,
    <>
      <path d="M7 3h7l4 4v14H7V3z" />
      <path d="M14 3v4h4" />
      <path d="M10 12h5M10 16h5" />
    </>
  );
}

export function IconShield({ size = 20, className }: IconProps) {
  return base(
    size,
    className,
    <>
      <path d="M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6l8-3z" />
      <path d="M9.5 12l1.8 1.8 3.4-3.6" />
    </>
  );
}

export function IconChat({ size = 20, className }: IconProps) {
  return base(
    size,
    className,
    <>
      <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
    </>
  );
}

export function IconPhone({ size = 20, className }: IconProps) {
  return base(
    size,
    className,
    <>
      <path d="M8.5 3.5h3l1.5 4-2 1.2a10 10 0 0 0 4.3 4.3l1.2-2 4 1.5v3A2.2 2.2 0 0 1 18.3 17 14.5 14.5 0 0 1 7 5.7 2.2 2.2 0 0 1 8.5 3.5z" />
    </>
  );
}

export function IconPlus({ size = 18, className }: IconProps) {
  return base(size, className, <path d="M12 5v14M5 12h14" strokeWidth="2" />);
}

export function IconMenu({ size = 18, className }: IconProps) {
  return base(size, className, <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="2" />);
}

export function IconClose({ size = 18, className }: IconProps) {
  return base(size, className, <path d="M6 6l12 12M18 6L6 18" strokeWidth="2" />);
}

export function IconPanel({ size = 18, className }: IconProps) {
  return base(
    size,
    className,
    <>
      <path d="M4 6h16M4 12h10M4 18h16" strokeWidth="2" />
    </>
  );
}

export function IconSend({ size = 18, className }: IconProps) {
  return base(size, className, <path d="M4 12l16-7-7 16-2.5-6.5L4 12z" strokeWidth="2" />);
}
