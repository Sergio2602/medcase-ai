export function Logo({ size = 28 }: { size?: number }) {
  const iconSize = Math.round(size * 0.6);
  const radius = Math.round(size * 0.25);
  return (
    <div className="flex items-center gap-2">
      <div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: "#1d4ed8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
            fill="transparent"
            stroke="#ffffff"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="9.5"
            y="2.5"
            width="5"
            height="4"
            rx="1.5"
            fill="transparent"
            stroke="#ffffff"
            strokeWidth="1.5"
          />
          <path
            d="M12 18.5C12 18.5 8 16 8 13.5C8 11.5 9.5 11 11 11C11.8 11 12 11.8 12 11.8C12 11.8 12.2 11 13 11C14.5 11 16 11.5 16 13.5C16 16 12 18.5 12 18.5Z"
            fill="#ffffff"
          />
        </svg>
      </div>
      <span className="text-xl font-extrabold tracking-tight">
        <span style={{ color: "#0f0f0f" }}>Med</span>
        <span style={{ color: "#1d4ed8" }}>case</span>
      </span>
    </div>
  );
}
