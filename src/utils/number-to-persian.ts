/**
 * Word forms for numbers 0–19 in Persian (Farsi).
 * Index into this array directly for numbers below 20.
 */
const units = [
  "",
  "یک",
  "دو",
  "سه",
  "چهار",
  "پنج",
  "شش",
  "هفت",
  "هشت",
  "نه",
  "ده",
  "یازده",
  "دوازده",
  "سیزده",
  "چهارده",
  "پانزده",
  "شانزده",
  "هفده",
  "هجده",
  "نوزده",
];

/**
 * Word forms for the tens place (20, 30, 40, ...90) in Persian.
 * Indices 0 and 1 are unused placeholders since 0–19 are handled by `units`.
 */
const tens = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];

/**
 * Word forms for the hundreds place (100, 200, ...900) in Persian.
 * Indexed by the hundreds digit (1–9).
 */
const hundredsWords = [
  "", // 0 — unused, hundreds digit is never 0 when this array is indexed
  "صد",
  "دویست",
  "سیصد",
  "چهارصد",
  "پانصد",
  "ششصد",
  "هفتصد",
  "هشتصد",
  "نهصد",
];

/**
 * Converts a non-negative integer into its Persian (Farsi) word representation.
 *
 * Supports values from 0 up to 999. Numbers 1000 and above are not spelled
 * out and are instead returned as a plain numeric string (see fallback below).
 *
 * Examples:
 *   numberToPersian(7)   -> "هفت"
 *   numberToPersian(23)  -> "بیست و سه"
 *   numberToPersian(418) -> "چهارصد و هجده"
 *
 * @param n - The number to convert (expected range: 0–999)
 * @returns The Persian word form of the number, joined with "و" ("and")
 *          where multiple parts are combined.
 */
export function numberToPersian(n: number): string {
  // Base case: 0–19 have unique words, no composition needed.
  if (n < 20) return units[n];

  // 20–99: combine the tens word with the units word, e.g. "سی و دو" (32).
  if (n < 100) {
    const tensDigit = Math.floor(n / 10);
    const unitsDigit = n % 10;

    return tens[tensDigit] + (unitsDigit ? " و " + units[unitsDigit] : "");
  }

  // 100–999: combine the hundreds word with the recursively-converted remainder,
  // e.g. 418 -> "چهارصد" + " و " + numberToPersian(18).
  if (n < 1000) {
    const hundredsDigit = Math.floor(n / 100);
    const remainder = n % 100;

    return hundredsWords[hundredsDigit] + (remainder ? " و " + numberToPersian(remainder) : "");
  }

  // Fallback: numbers >= 1000 aren't supported for word conversion,
  // so just return the digits as-is. CaptchaCore never generates values
  // this large (range is 100–999), but this guards against misuse.
  return n.toString();
}
