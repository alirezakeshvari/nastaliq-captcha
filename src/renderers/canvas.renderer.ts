import { createCanvas, registerFont } from "canvas";
import path from "path";

// Register the Nastaliq font once at module load so it's available to every
// canvas context created by this renderer.
registerFont(path.join(__dirname, "../assets/fonts/nastaliq.ttf"), { family: "Nastaliq" });

type RGB = { r: number; g: number; b: number };

/**
 * Renders CAPTCHA text onto a canvas as a PNG image, with randomized
 * background/foreground colors, visual noise (dots + interference lines),
 * and slight text rotation — all intended to make the image harder for
 * bots to OCR while staying readable to a human.
 */
export class CanvasRenderer {
  /**
   * Renders the given text as a distorted CAPTCHA image.
   *
   * @param text - The text to draw (typically Persian words from CaptchaCore).
   * @param width - Image width in pixels.
   * @param height - Image height in pixels.
   * @returns A PNG image buffer ready to send to the client.
   */
  render(text: string, width: number, height: number): Buffer {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // --- Background / text colors ---
    // Pick a light background and a dark foreground independently at random,
    // but keep re-rolling until they have enough contrast to stay legible.
    // (Without this check, random colors could occasionally produce a
    // near-invisible image, e.g. light gray text on a near-white background.)
    let bg: RGB;
    let fg: RGB;

    do {
      bg = this.randomRGB(180, 255); // light background
      fg = this.randomRGB(0, 180); // darker text
    } while (!this.hasGoodContrast(bg, fg));

    ctx.fillStyle = this.rgbToString(bg);
    ctx.fillRect(0, 0, width, height);

    // --- Noise: scattered dots ---
    // Adds light speckle across the whole canvas to make uniform-background
    // detection (a common anti-CAPTCHA technique) less effective.
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = `rgba(0,0,0,0.08)`;
      ctx.fillRect(Math.random() * width, Math.random() * height, 1, 1);
    }

    // --- Noise: interference lines ---
    // Draws a handful of random curved lines across the image to disrupt
    // edge-detection/OCR without obscuring the text too heavily for humans.
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(0,0,0,0.15)`;
      ctx.lineWidth = Math.random() * 2;

      ctx.beginPath();
      ctx.moveTo(Math.random() * width, Math.random() * height);

      ctx.bezierCurveTo(
        Math.random() * width,
        Math.random() * height,
        Math.random() * width,
        Math.random() * height,
        Math.random() * width,
        Math.random() * height
      );

      ctx.stroke();
    }

    // --- Text rendering ---
    ctx.fillStyle = this.rgbToString(fg);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Shrink the font size from a large starting point until the text fits
    // comfortably within the canvas (accounting for padding on width, and
    // an estimated line height of fontSize * 1.4 for the height check).
    let fontSize = 100;
    const font = "Nastaliq";
    const padding = 20;

    do {
      fontSize--;
      ctx.font = `${fontSize}px ${font}`;
    } while (ctx.measureText(text).width > canvas.width - padding || fontSize * 1.4 > canvas.height - padding);

    // Apply a small random rotation (~±8.6°, since 0.3 rad ≈ 17.2° total range)
    // to the text for extra distortion. We rotate the whole canvas around its
    // center, draw the text at the (now-centered) origin, then rotate back so
    // any drawing after this point isn't affected.
    const angle = (Math.random() - 0.5) * 0.3;

    ctx.translate(width / 2, height / 2);
    ctx.rotate(angle);

    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 2;

    ctx.fillText(text, 0, 0);

    ctx.rotate(-angle);
    ctx.translate(-width / 2, -height / 2);

    return canvas.toBuffer("image/png");
  }

  // =========================
  // Color helpers
  // =========================

  /** Generates a random RGB color with each channel between [min, max]. */
  private randomRGB(min: number, max: number): RGB {
    return {
      r: this.r(min, max),
      g: this.r(min, max),
      b: this.r(min, max),
    };
  }

  /** Formats an RGB color object as a CSS `rgb(...)` string. */
  private rgbToString(c: RGB) {
    return `rgb(${c.r},${c.g},${c.b})`;
  }

  /**
   * Checks whether two colors have sufficient contrast to be readable
   * together, using the WCAG relative luminance contrast ratio formula.
   * A ratio above 3 is a fairly lenient threshold (WCAG AA normally wants
   * 4.5+ for body text), chosen here to keep color variety high while
   * still avoiding illegible combinations.
   */
  private hasGoodContrast(a: RGB, b: RGB): boolean {
    const l1 = this.luminance(a);
    const l2 = this.luminance(b);

    const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    return contrast > 3;
  }

  /** Computes relative luminance of a color per the WCAG formula. */
  private luminance(c: RGB) {
    return 0.2126 * (c.r / 255) + 0.7152 * (c.g / 255) + 0.0722 * (c.b / 255);
  }

  /** Returns a random integer in [min, max). */
  private r(min: number, max: number) {
    return Math.floor(Math.random() * (max - min) + min);
  }
}
