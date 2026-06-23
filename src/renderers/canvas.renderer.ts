import { createCanvas, registerFont, ImageData } from "canvas";
import path from "path";

registerFont(path.join(__dirname, "../assets/fonts/nastaliq.ttf"), { family: "Nastaliq" });

type RGB = { r: number; g: number; b: number };

/**
 * Difficulty-scaled parameters derived from a 0–10 input.
 * Every property is a plain number so callers can inspect or override them.
 */
interface DifficultyParams {
  /** Number of noise dots. */
  dotCount: number;
  /** Max dot size in pixels (1 = minimum). */
  dotMaxSize: number;
  /** Number of bezier interference lines. */
  lineCount: number;
  /** Fraction of lines constrained to the text band (0–1). */
  lineBandFraction: number;
  /** Number of ghost/decoy text layers (0 = none). */
  ghostCount: number;
  /** Max ghost opacity (e.g. 0.18). */
  ghostMaxOpacity: number;
  /** Per-word rotation range in radians (total span = 2 × value). */
  wordRotation: number;
  /** Per-word vertical jitter as a fraction of font size. */
  wordJitter: number;
  /** Per-word x/y scale variance (e.g. 0.15 → scale in 0.85–1.15). */
  wordScaleVariance: number;
  /** Pixel-warp amplitude in pixels (0 = no warp). */
  warpAmplitude: number;
  /** Pixel-warp frequency (cycles per pixel). */
  warpFrequency: number;
  /** Minimum WCAG contrast ratio required between bg and fg. */
  contrastFloor: number;
}

/**
 * Renders CAPTCHA text onto a canvas as a PNG image.
 *
 * Pass an optional `difficulty` (0–10, default 5) to control how aggressively
 * the image is distorted.  At 0 the image is as clean as possible while still
 * being a valid CAPTCHA; at 10 every anti-OCR technique is cranked to its
 * maximum.
 *
 * Hardening techniques (all scale with difficulty):
 *  1. Sinusoidal pixel-warp  — post-processing displacement map.
 *  2. Per-word transforms    — independent rotation, jitter, scale per word.
 *  3. Ghost/decoy text       — low-opacity decoy copies before the real text.
 *  4. Dot + line noise       — scattered dots and bezier lines through text.
 *  5. Contrast floor         — loosened at low difficulty, tightened at high.
 */
export class CanvasRenderer {
  // ─── public API ────────────────────────────────────────────────────────────

  /**
   * Renders the given text as a CAPTCHA image.
   *
   * @param text        Persian text to encode (may contain spaces).
   * @param width       Image width in pixels.
   * @param height      Image height in pixels.
   * @param difficulty  Distortion level 0–10 (default 5).
   * @returns           PNG buffer ready to send to the client.
   */
  render(text: string, width: number, height: number, difficulty: number): Buffer {
    const d = Math.max(0, Math.min(10, difficulty));
    const p = this.buildParams(d);

    // We draw everything onto a scratch canvas, then apply the pixel-warp
    // onto a final canvas so the warp covers noise, lines, and text alike.
    const scratch = createCanvas(width, height);
    const ctx = scratch.getContext("2d");

    // ── 1. Background / foreground colors ────────────────────────────────────
    // At low difficulty we keep a higher contrast floor so the image is clean.
    // At high difficulty the floor drops slightly (more colour variety means
    // less "obvious" fg/bg, and noise provides additional masking).
    let bg: RGB;
    let fg: RGB;

    do {
      bg = this.randomRGB(185, 255);
      fg = this.randomRGB(0, 170);
    } while (!this.hasGoodContrast(bg, fg, p.contrastFloor));

    ctx.fillStyle = this.rgbToString(bg);
    ctx.fillRect(0, 0, width, height);

    // ── 2. Noise: dots ───────────────────────────────────────────────────────
    for (let i = 0; i < p.dotCount; i++) {
      const size = 1 + Math.random() * (p.dotMaxSize - 1);
      const opacity = 0.05 + Math.random() * 0.15;
      ctx.fillStyle = `rgba(0,0,0,${opacity.toFixed(2)})`;
      ctx.fillRect(Math.random() * width, Math.random() * height, size, size);
    }

    // ── 3. Noise: interference lines ─────────────────────────────────────────
    const textBandTop = height * 0.2;
    const textBandBottom = height * 0.8;
    const bandLines = Math.round(p.lineCount * p.lineBandFraction);

    for (let i = 0; i < p.lineCount; i++) {
      const inBand = i < bandLines;
      const randY = () => (inBand ? textBandTop + Math.random() * (textBandBottom - textBandTop) : Math.random() * height);

      ctx.strokeStyle = `rgba(0,0,0,${(0.1 + Math.random() * 0.15).toFixed(2)})`;
      ctx.lineWidth = 0.5 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(Math.random() * width, randY());
      ctx.bezierCurveTo(Math.random() * width, randY(), Math.random() * width, randY(), Math.random() * width, randY());
      ctx.stroke();
    }

    // ── 4. Ghost / decoy text ────────────────────────────────────────────────
    if (p.ghostCount > 0) {
      const ghostColor = this.complementaryRGB(fg);
      for (let g = 0; g < p.ghostCount; g++) {
        ctx.save();
        ctx.globalAlpha = 0.08 + Math.random() * p.ghostMaxOpacity;
        ctx.fillStyle = this.rgbToString(ghostColor);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const ghostFontSize = 28 + Math.random() * 32;
        ctx.font = `${ghostFontSize}px Nastaliq`;

        const ghostX = (0.15 + Math.random() * 0.7) * width;
        const ghostY = (0.15 + Math.random() * 0.7) * height;
        const ghostAngle = (Math.random() - 0.5) * 0.8;

        ctx.translate(ghostX, ghostY);
        ctx.rotate(ghostAngle);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    }

    // ── 5. Real text: per-word rendering ─────────────────────────────────────
    // Persian is RTL; split on whitespace, keep ligatures intact by working
    // at word granularity, and lay words out right-to-left.
    const words = text.split(/\s+/).filter(Boolean);
    const padding = 30;

    let fontSize = 100;

    const measureTotal = (): number => {
      let w = 0;
      words.forEach((word, i) => {
        ctx.font = `${fontSize}px Nastaliq`;
        w += ctx.measureText(word).width + (i < words.length - 1 ? fontSize * 0.3 : 0);
      });
      return w;
    };

    while ((measureTotal() > width - padding * 2 || fontSize * 1.6 > height - padding * 2) && fontSize > 20) {
      fontSize--;
    }

    const gap = fontSize * 0.3;
    const totalW = measureTotal();
    let cursor = (width + totalW) / 2; // right edge of text block (RTL)

    ctx.shadowColor = "rgba(0,0,0,0.30)";
    ctx.shadowBlur = 3;

    words.forEach((word) => {
      ctx.font = `${fontSize}px Nastaliq`;
      const wordW = ctx.measureText(word).width;

      const wordCenterX = cursor - wordW / 2;
      const wordCenterY = height / 2;

      // Per-word transforms — all ranges scale with difficulty params.
      const angle = (Math.random() - 0.5) * 2 * p.wordRotation;
      const jitterY = (Math.random() - 0.5) * fontSize * p.wordJitter;
      const scaleX = 1 + (Math.random() - 0.5) * 2 * p.wordScaleVariance;
      const scaleY = 1 + (Math.random() - 0.5) * 2 * p.wordScaleVariance;

      ctx.save();
      ctx.fillStyle = this.rgbToString(fg);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.translate(wordCenterX, wordCenterY + jitterY);
      ctx.rotate(angle);
      ctx.scale(scaleX, scaleY);
      ctx.fillText(word, 0, 0);
      ctx.restore();

      cursor -= wordW + gap;
    });

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // ── 6. Pixel-warp post-processing ────────────────────────────────────────
    // At difficulty 0, warpAmplitude is 0 and we skip the warp entirely to
    // avoid any unnecessary pixel-copy overhead.
    if (p.warpAmplitude === 0) {
      return scratch.toBuffer("image/png");
    }

    const final = createCanvas(width, height);
    const fctx = final.getContext("2d");

    const srcData: ImageData = ctx.getImageData(0, 0, width, height);
    const dstData: ImageData = fctx.createImageData(width, height);
    const src = srcData.data;
    const dst = dstData.data;

    const amp = p.warpAmplitude;
    const freq = p.warpFrequency;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcX = Math.round(x + amp * Math.sin(freq * y));
        const srcY = Math.round(y + amp * Math.sin(freq * x));

        const dstIdx = (y * width + x) * 4;

        if (srcX < 0 || srcX >= width || srcY < 0 || srcY >= height) {
          dst[dstIdx] = bg.r;
          dst[dstIdx + 1] = bg.g;
          dst[dstIdx + 2] = bg.b;
          dst[dstIdx + 3] = 255;
        } else {
          const srcIdx = (srcY * width + srcX) * 4;
          dst[dstIdx] = src[srcIdx];
          dst[dstIdx + 1] = src[srcIdx + 1];
          dst[dstIdx + 2] = src[srcIdx + 2];
          dst[dstIdx + 3] = src[srcIdx + 3];
        }
      }
    }

    fctx.putImageData(dstData, 0, 0);
    return final.toBuffer("image/png");
  }

  // ─── difficulty interpolation ───────────────────────────────────────────────

  /**
   * Derives all rendering parameters from a 0–10 difficulty value by linearly
   * interpolating between a "floor" (difficulty 0) and "ceiling" (difficulty 10)
   * for each property.
   *
   * Using a single interpolation helper keeps the scaling logic easy to reason
   * about: every property has one obvious place where its min/max live.
   */
  private buildParams(d: number): DifficultyParams {
    // t = 0 at difficulty 0, t = 1 at difficulty 10.
    const t = d / 10;
    const lerp = (lo: number, hi: number) => lo + (hi - lo) * t;

    return {
      // Dots: 200 at d=0, 5 000 at d=10.
      dotCount: Math.round(lerp(200, 5000)),
      // Dot size: fixed 1 px at d=0, up to 4 px at d=10.
      dotMaxSize: lerp(1, 4),
      // Lines: 2 at d=0, 18 at d=10.
      lineCount: Math.round(lerp(2, 18)),
      // Band fraction: at d=0 lines avoid the text; at d=10 half go through it.
      lineBandFraction: lerp(0, 0.5),
      // Ghost layers: 0 at d=0, 3 at d=10.
      ghostCount: Math.round(lerp(0, 3)),
      // Ghost max opacity: irrelevant at d=0 (ghostCount=0); grows to 0.22 at d=10.
      ghostMaxOpacity: lerp(0, 0.22),
      // Word rotation: no rotation at d=0, ±20° (0.35 rad) at d=10.
      wordRotation: lerp(0, 0.35),
      // Vertical jitter: 0 at d=0, 40% of font size at d=10.
      wordJitter: lerp(0, 0.4),
      // Scale variance: 0 at d=0 (no distortion), 0.20 at d=10 (±20%).
      wordScaleVariance: lerp(0, 0.2),
      // Warp amplitude: 0 px at d=0 (warp skipped), 8 px at d=10.
      warpAmplitude: lerp(0, 8),
      // Warp frequency: kept constant (changes amplitude is enough).
      warpFrequency: 0.04,
      // Contrast floor: high (clean) at d=0, slightly lower at d=10 (more variety).
      contrastFloor: lerp(6.0, 4.5),
    };
  }

  // ─── color helpers ──────────────────────────────────────────────────────────

  private randomRGB(min: number, max: number): RGB {
    return { r: this.ri(min, max), g: this.ri(min, max), b: this.ri(min, max) };
  }

  private complementaryRGB(c: RGB): RGB {
    return {
      r: (c.r + 128) % 256,
      g: (c.g + 80) % 256,
      b: (c.b + 160) % 256,
    };
  }

  private rgbToString(c: RGB): string {
    return `rgb(${c.r},${c.g},${c.b})`;
  }

  private hasGoodContrast(a: RGB, b: RGB, floor: number): boolean {
    const l1 = this.luminance(a);
    const l2 = this.luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) > floor;
  }

  private luminance(c: RGB): number {
    return 0.2126 * (c.r / 255) + 0.7152 * (c.g / 255) + 0.0722 * (c.b / 255);
  }

  private ri(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min) + min);
  }
}
