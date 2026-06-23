import { CaptchaCore } from "./core/captcha";
import { CanvasRenderer } from "./renderers/canvas.renderer";

/**
 * Optional sizing configuration for a generated CAPTCHA image.
 */
export interface CaptchaConfig {
  /** Image width in pixels. Defaults to 200. */
  width?: number;
  /** Image height in pixels. Defaults to 60. */
  height?: number;
  /**  Optional difficulty level (e.g. 1-10) to control how hard the CAPTCHA is to solve. */
  difficulty?: number;
}

/**
 * The output of generating a CAPTCHA: the rendered image plus the answer
 * needed to verify a user's response.
 */
export interface CaptchaResult {
  /** PNG image buffer to display to the user. */
  image: Buffer;
  /**
   * The correct answer (Persian text) for this CAPTCHA.
   *
   * SECURITY NOTE: This is returned directly alongside the image. If this
   * result is sent as-is to the client (e.g. in an API response body), the
   * CAPTCHA provides no real protection — anyone inspecting the response can
   * read the answer without solving anything.
   *
   * This is fine if your integration keeps `answer` server-side only (e.g.
   * stored in a session/cache, keyed by a challenge ID, and only the `image`
   * is sent to the client). It is NOT fine if both fields end up in the same
   * client-facing payload. Left unchanged here since fixing it would require
   * deciding how you want challenge state stored/verified — happy to help
   * wire that up if useful.
   */
  answer: number;
}

/**
 * Generates Nastaliq-script CAPTCHAs: a random number spelled out in
 * Persian words, rendered as a distorted image.
 *
 * Usage:
 *   const captcha = new NastaliqCaptcha();
 *   const { image, answer } = captcha.generate({ width: 240, height: 80 });
 *   // store `answer` server-side, send `image` to the client
 */
export class NastaliqCaptcha {
  private core: CaptchaCore;
  private renderer: CanvasRenderer;

  constructor() {
    this.core = new CaptchaCore();
    this.renderer = new CanvasRenderer();
  }

  /**
   * Generates a new CAPTCHA challenge and renders it as an image.
   *
   * @param config - Optional width/height overrides for the output image.
   * @returns The rendered image and its answer (see security note on
   *          `CaptchaResult.answer` regarding how to handle this safely).
   */
  generate(config?: CaptchaConfig): CaptchaResult {
    const challenge = this.core.create();

    const width = config?.width ?? 200;
    const height = config?.height ?? 60;
    const difficulty = config?.difficulty ?? 5;
    const image = this.renderer.render(challenge.answer, width, height, difficulty);

    return {
      image,
      answer: challenge.raw,
    };
  }
}
