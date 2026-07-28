export function Logo({ size = 28 }: { size?: number }) {
  // Wortmarke-only (kein Icon), Serifen-Schrift wie im Marken-Mockup.
  const fontSize = Math.round(size * 0.78);
  return (
    <div className="flex min-w-0 items-center overflow-hidden">
      <span
        className="min-w-0 truncate font-bold"
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize,
          letterSpacing: "-0.01em",
          lineHeight: 1,
        }}
      >
        <span style={{ color: "#1b3a5c" }}>Casolv</span>
        <span style={{ color: "#2f6fb0" }}>o</span>
      </span>
    </div>
  );
}
