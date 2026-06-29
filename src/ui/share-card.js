// Victory / run share-card rendering, extracted from main.js.
//
// Everything here is pure with respect to app state: renderShareCard() paints a
// PNG purely from the `data` object it is given, and the IO helpers only touch
// browser APIs (canvas, clipboard, anchor download). The state-reading builders
// that assemble `data` (buildShareDataFromState / buildRunShareData) stay in
// main.js and call renderShareCard with the result.

export async function copyShareText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Paint the victory share card onto an off-screen canvas and hand back a PNG
// blob. Drawn programmatically (no html2canvas dependency) so it stays crisp at
// social-media resolution and the on-screen card remains its visual twin.
export async function renderShareCard(data) {
  const W = 1080;
  const H = 1350;
  const cx = W / 2;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const FONT = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  const scoreText = Number(data.score ?? 0).toLocaleString("en-US");
  const formText = data.subtitle || `Merged to ${data.formName ?? "Blupet"}`;
  const collectionText = data.forms ? `${data.forms} Blupets collected` : "Blupets collected";

  // Trophy-poster backdrop.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#079de5");
  bg.addColorStop(0.42, "#42c8ed");
  bg.addColorStop(0.78, "#dff8ff");
  bg.addColorStop(1, "#ffffff");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Stage glow.
  const stageGlow = ctx.createRadialGradient(cx, 620, 30, cx, 620, 650);
  stageGlow.addColorStop(0, "rgba(255,255,255,0.9)");
  stageGlow.addColorStop(0.42, "rgba(255,255,255,0.32)");
  stageGlow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = stageGlow;
  ctx.fillRect(0, 0, W, H);

  // Start-screen style rays behind the trophy art.
  ctx.save();
  ctx.translate(cx, 610);
  for (let i = 0; i < 34; i += 1) {
    ctx.rotate((Math.PI * 2) / 34);
    const ray = ctx.createLinearGradient(0, 0, 0, -900);
    ray.addColorStop(0, "rgba(255,255,255,0.38)");
    ray.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = ray;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(12, 0);
    ctx.lineTo(54, -900);
    ctx.lineTo(-54, -900);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const sparkles = [
    [146, 222, 11], [884, 206, 8], [954, 392, 13], [116, 548, 8],
    [220, 850, 10], [914, 862, 9], [158, 1060, 7], [852, 1118, 12],
    [520, 118, 7], [706, 302, 9], [370, 1034, 8], [760, 694, 10],
  ];
  for (const [x, y, r] of sparkles) {
    drawSparkle(ctx, x, y, r, "rgba(255,255,255,0.9)", "rgba(104,216,255,0.62)");
  }

  // Thin poster frame.
  roundRect(ctx, 48, 48, W - 96, H - 96, 28);
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(17,158,224,0.78)";
  ctx.stroke();

  // Brand row — the official Blupets logo mark + wordmark, centered as a unit.
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(21,91,148,0.28)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.font = `900 34px ${FONT}`;
  const brandText = "B L U P E T S";
  const brandTextW = ctx.measureText(brandText).width;
  const markSize = 44;
  const markGap = 18;
  const brandTotal = markSize + markGap + brandTextW;
  const brandLeft = cx - brandTotal / 2;
  const brandBaseline = 142;
  try {
    const logo = await loadImage("./assets/blu-logo.png");
    ctx.drawImage(logo, brandLeft, brandBaseline - markSize + 6, markSize, markSize);
  } catch {
    // Logo failed to load — the wordmark alone still brands the card.
  }
  ctx.textAlign = "left";
  ctx.fillText(brandText, brandLeft + markSize + markGap, brandBaseline);
  ctx.textAlign = "center";
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Headline.
  ctx.fillStyle = "#16324a";
  ctx.font = `900 ${String(data.title || "").length > 10 ? 100 : 122}px ${FONT}`;
  ctx.fillText(data.title || "BLUPETS RUN", cx, 282);

  // Hero art (best-effort — skip cleanly if it won't load).
  try {
    const img = await loadImage(data.art);
    const artSize = 500;
    const artX = cx - artSize / 2;
    const artY = 360;
    const artHalo = ctx.createRadialGradient(cx, artY + artSize * 0.52, 30, cx, artY + artSize * 0.52, 360);
    artHalo.addColorStop(0, "rgba(255,255,255,0.74)");
    artHalo.addColorStop(0.42, "rgba(104,216,255,0.28)");
    artHalo.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = artHalo;
    ctx.fillRect(artX - 170, artY - 150, artSize + 340, artSize + 300);
    ctx.save();
    ctx.shadowColor = "rgba(25,63,103,0.28)";
    ctx.shadowBlur = 44;
    ctx.shadowOffsetY = 28;
    ctx.drawImage(img, artX, artY, artSize, artSize);
    ctx.restore();
  } catch {
    // No art — leave the gap; the rest of the card still reads well.
  }

  // Result detail.
  ctx.fillStyle = "#526b8b";
  ctx.font = `900 50px ${FONT}`;
  ctx.fillText(formText, cx, 920);

  // Score trophy badge.
  const scoreY = 1078;
  roundRect(ctx, cx - 300, scoreY - 86, 600, 170, 44);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(104,216,255,0.72)";
  ctx.stroke();
  roundRect(ctx, cx - 280, scoreY - 66, 560, 130, 32);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.stroke();
  ctx.fillStyle = "#8497ad";
  ctx.font = `900 28px ${FONT}`;
  ctx.fillText("SCORE", cx, scoreY - 18);
  ctx.fillStyle = "#16324a";
  ctx.font = `900 82px ${FONT}`;
  ctx.fillText(scoreText, cx, scoreY + 62);

  // Collection progress as a quiet share-worthy secondary stat.
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  roundRect(ctx, cx - 255, 1202, 510, 66, 28);
  ctx.fill();
  ctx.strokeStyle = "rgba(104,216,255,0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#526b8b";
  ctx.font = `900 27px ${FONT}`;
  ctx.fillText(collectionText, cx, 1245);

  return await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawSparkle(ctx, x, y, radius, core, glow) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.42, radius * 2.4, 0, 0, Math.PI * 2);
  ctx.ellipse(0, 0, radius * 2.4, radius * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.18, radius * 1.2, 0, 0, Math.PI * 2);
  ctx.ellipse(0, 0, radius * 1.2, radius * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
