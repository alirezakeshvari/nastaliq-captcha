import { randomInt } from "crypto";
import { numberToPersian } from "../utils/number-to-persian";

/**
 * The result of generating a CAPTCHA challenge.
 */
export interface CaptchaChallenge {
  /** The Persian word form of the number — what gets rendered as the image text. */
  answer: string;
  /** The raw numeric value the answer was derived from. */
  raw: number;
}

/**
 * Generates the underlying "challenge" for a CAPTCHA: a random number and
 * its Persian word spelling. This class is purely concerned with producing
 * the answer — rendering it into an image is handled separately by a renderer
 * (see CanvasRenderer).
 */
export class CaptchaCore {
  /**
   * Creates a new challenge by picking a random number and converting it to
   * its Persian word form.
   *
   * Uses `crypto.randomInt` (cryptographically secure) rather than `Math.random`,
   * which matters here since this value is the actual CAPTCHA secret — it
   * should not be predictable.
   *
   * @returns An object containing the Persian text to render (`answer`) and
   *          the original number it came from (`raw`).
   */
  create(): CaptchaChallenge {
    // NOTE: randomInt's upper bound is EXCLUSIVE, so this actually generates
    // numbers in the range 100–998, not 100–999 as the call might suggest.
    // Left as-is since changing it changes the output range — bump to
    const number = randomInt(100, 1000);
    const text = numberToPersian(number);

    return {
      answer: text,
      raw: number,
    };
  }
}
