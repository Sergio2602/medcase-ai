export function Logo({ size = 28, light = false }: { size?: number; light?: boolean }) {
  // Wortmarke-only (kein Icon). Update 07.10.2026 (Sergio, "aus Spaß"):
  // Fraunces statt Georgia-Fallback — schärfere, kontrastreichere Serife
  // als freier Ersatz für die kommerzielle "Spitzkant" (nicht lizenziert).
  const fontSize = Math.round(size * 0.78);
  return (
    <div className="flex min-w-0 items-center overflow-hidden">
      <span
        className="min-w-0 truncate"
        style={{
          fontFamily: "var(--font-fraunces), Georgia, 'Times New Roman', serif",
          fontSize,
          fontWeight: 500,
          letterSpacing: "0",
          lineHeight: 1,
        }}
      >
        <span style={{ color: light ? "#ffffff" : "#1b3a5c" }}>Casolv</span>
        <span style={{ color: light ? "#ffffff" : "#2f6fb0" }}>o</span>
      </span>
    </div>
  );
}
