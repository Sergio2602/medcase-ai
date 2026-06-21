export interface ShareCardData {
  score: number;
  maxScore: number;
  patientName: string;
  patientAge: number;
  diagnosis: string;
  revealedCount: number;
  totalCategories: number;
  isCorrect: boolean;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = current + " " + words[i];
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Replicates the clipboard-heart SVG from Logo.tsx, scaled to fit a square of `size` px.
function drawLogoIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
) {
  // Blue rounded background square
  const r = Math.round(size * 0.25);
  drawRoundedRect(ctx, x, y, size, size, r);
  ctx.fillStyle = "#1d4ed8";
  ctx.fill();

  // Scale the 24×24 SVG viewBox to the icon area (with ~20% padding)
  const iconSize = size * 0.6;
  const offset = (size - iconSize) / 2;
  const s = iconSize / 24;
  const tx = x + offset;
  const ty = y + offset;

  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(s, s);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Clipboard outline
  ctx.beginPath();
  ctx.moveTo(9, 5);
  ctx.lineTo(7, 5);
  ctx.arcTo(5, 5, 5, 7, 2);
  ctx.lineTo(5, 19);
  ctx.arcTo(5, 21, 7, 21, 2);
  ctx.lineTo(17, 21);
  ctx.arcTo(19, 21, 19, 19, 2);
  ctx.lineTo(19, 7);
  ctx.arcTo(19, 5, 17, 5, 2);
  ctx.lineTo(15, 5);
  ctx.stroke();

  // Clipboard top tab
  ctx.beginPath();
  ctx.roundRect(9.5, 2.5, 5, 4, 1.5);
  ctx.stroke();

  // Heart fill (white)
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(12, 18.5);
  ctx.bezierCurveTo(12, 18.5, 8, 16, 8, 13.5);
  ctx.bezierCurveTo(8, 11.5, 9.5, 11, 11, 11);
  ctx.bezierCurveTo(11.8, 11, 12, 11.8, 12, 11.8);
  ctx.bezierCurveTo(12, 11.8, 12.2, 11, 13, 11);
  ctx.bezierCurveTo(14.5, 11, 16, 11.5, 16, 13.5);
  ctx.bezierCurveTo(16, 16, 12, 18.5, 12, 18.5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

export async function generateShareCard(data: ShareCardData): Promise<Blob> {
  await document.fonts.ready;

  const W = 1080;
  const H = 1920;
  const PAD = 80;
  const CW = W - PAD * 2; // 920

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#f4f3ee";
  ctx.fillRect(0, 0, W, H);

  // Dot pattern (matches globals.css background-image)
  ctx.fillStyle = "rgba(15, 15, 15, 0.11)";
  for (let dx = 0; dx < W; dx += 5) {
    for (let dy = 0; dy < H; dy += 5) {
      ctx.fillRect(dx, dy, 1, 1);
    }
  }

  // ── Logo ──────────────────────────────────────────────────────────────
  const ICON_SIZE = 72;
  const LOGO_Y = 100;
  drawLogoIcon(ctx, PAD, LOGO_Y, ICON_SIZE);

  ctx.font = '800 56px "Inter", system-ui, sans-serif';
  ctx.fillStyle = "#0f0f0f";
  const medW = ctx.measureText("Med").width;
  ctx.fillText("Med", PAD + ICON_SIZE + 18, LOGO_Y + 52);
  ctx.fillStyle = "#1d4ed8";
  ctx.fillText("case", PAD + ICON_SIZE + 18 + medW, LOGO_Y + 52);

  // ── Score ─────────────────────────────────────────────────────────────
  ctx.font = '800 210px "Inter", system-ui, sans-serif';
  ctx.fillStyle = "#1d4ed8";
  ctx.textAlign = "center";
  ctx.fillText(String(data.score), W / 2, 490);

  ctx.font = '500 40px "Inter", system-ui, sans-serif';
  ctx.fillStyle = "#5f5e5a";
  ctx.fillText(`von ${data.maxScore} Punkten`, W / 2, 570);

  // ── Badge ─────────────────────────────────────────────────────────────
  const badgeText = data.isCorrect ? "✓ Richtig erkannt" : "Fall abgeschlossen";
  ctx.font = '700 34px "Inter", system-ui, sans-serif';
  const badgeTextW = ctx.measureText(badgeText).width;
  const badgePadX = 40;
  const badgePadY = 18;
  const badgeW = badgeTextW + badgePadX * 2;
  const badgeH = 34 + badgePadY * 2;
  const badgeX = (W - badgeW) / 2;
  const badgeY = 630;

  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.fillStyle = data.isCorrect ? "#eef7ed" : "#f0f0ea";
  ctx.fill();
  ctx.strokeStyle = data.isCorrect ? "#bbdab2" : "#d8d6cd";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = data.isCorrect ? "#15803d" : "#5f5e5a";
  ctx.fillText(badgeText, W / 2, badgeY + badgePadY + 34 - 6);

  // ── Patient card ──────────────────────────────────────────────────────
  const CARD_X = PAD;
  const CARD_Y = 780;
  const CARD_W = CW;
  const CARD_H = 620;
  const CARD_PAD_X = 56;
  const CARD_PAD_Y = 52;
  const CARD_INNER_X = CARD_X + CARD_PAD_X;
  const CARD_INNER_W = CARD_W - CARD_PAD_X * 2;

  drawRoundedRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 24);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#d8d6cd";
  ctx.lineWidth = 2;
  ctx.stroke();

  let cy = CARD_Y + CARD_PAD_Y;

  // "PATIENT" label
  ctx.font = '700 22px "Inter", system-ui, sans-serif';
  ctx.fillStyle = "#5f5e5a";
  ctx.textAlign = "left";
  ctx.fillText("PATIENT", CARD_INNER_X, cy + 22);
  cy += 22 + 16;

  // Patient name + age
  ctx.font = `700 46px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = "#0f0f0f";
  const nameText = `${data.patientName}, ${data.patientAge} Jahre`;
  const nameLines = wrapText(ctx, nameText, CARD_INNER_W);
  for (const line of nameLines.slice(0, 2)) {
    ctx.fillText(line, CARD_INNER_X, cy + 46);
    cy += 60;
  }
  cy += 20;

  // Separator
  ctx.strokeStyle = "rgba(15,15,15,0.10)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(CARD_INNER_X, cy);
  ctx.lineTo(CARD_X + CARD_W - CARD_PAD_X, cy);
  ctx.stroke();
  cy += 30;

  // "DIAGNOSE" label
  ctx.font = '700 22px "Inter", system-ui, sans-serif';
  ctx.fillStyle = "#5f5e5a";
  ctx.fillText("DIAGNOSE", CARD_INNER_X, cy + 22);
  cy += 22 + 16;

  // Diagnosis text (wrap, max 2 lines)
  ctx.font = `700 42px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = "#0f0f0f";
  const diagLines = wrapText(ctx, data.diagnosis, CARD_INNER_W);
  for (const line of diagLines.slice(0, 2)) {
    ctx.fillText(line, CARD_INNER_X, cy + 42);
    cy += 56;
  }
  cy += 20;

  // Separator
  ctx.strokeStyle = "rgba(15,15,15,0.10)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(CARD_INNER_X, cy);
  ctx.lineTo(CARD_X + CARD_W - CARD_PAD_X, cy);
  ctx.stroke();
  cy += 30;

  // Revealed count
  ctx.font = `500 34px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = "#5f5e5a";
  ctx.fillText(
    `Nur ${data.revealedCount} von ${data.totalCategories} Befunden aufgedeckt`,
    CARD_INNER_X,
    cy + 34
  );

  // ── Footer ────────────────────────────────────────────────────────────
  ctx.textAlign = "center";
  ctx.font = `500 32px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = "#a8a69c";
  ctx.fillText("medcase-ai-peach.vercel.app  ·  #Medcase", W / 2, 1830);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png"
    );
  });
}
