export default function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="brand-gradient" x1="5" y1="35" x2="35" y2="5">
          <stop stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="#17171c" />
      <path
        d="M10 29V11h20v18M10 20h8l4-5 4 3h4"
        fill="none"
        stroke="url(#brand-gradient)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="30" cy="18" r="2.2" fill="#38bdf8" />
    </svg>
  );
}
