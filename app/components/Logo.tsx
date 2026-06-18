/**
 * Medcase logo: patient-file icon with pulse line + blue cross-dot accent.
 * Reused by page.tsx in the game-screen header (Schritt 3).
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect
          x="4"
          y="3"
          width="16"
          height="22"
          rx="2.5"
          fill="#ffffff"
          stroke="#0f0f0f"
          strokeWidth="1.5"
        />
        <path
          d="M14.5 3v4a1.5 1.5 0 0 0 1.5 1.5h4"
          stroke="#0f0f0f"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M6.5 17.5h2l1.5-3 2 5 1.5-3.5h3"
          stroke="#0f0f0f"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="21" cy="6" r="3" fill="#1d4ed8" />
        <path
          d="M21 4.6v2.8M19.6 6h2.8"
          stroke="#ffffff"
          strokeWidth="0.9"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-xl font-extrabold tracking-tight">
        <span style={{ color: "#0f0f0f" }}>Med</span>
        <span style={{ color: "#1d4ed8" }}>case</span>
      </span>
    </div>
  );
}
