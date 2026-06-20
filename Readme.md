# nastaliq-captcha

Generate CAPTCHA images using random numbers spelled out in **Persian (Farsi) words**, rendered in the Nastaliq script with randomized colors, noise, and rotation to resist OCR.

> **Note:** This README assumes the package is published as `nastaliq-captcha`. Adjust the install command below if your `package.json` uses a different name.

---

## Features

- 🔢 Random number generated with `crypto.randomInt` (cryptographically secure, not predictable)
- 🖋 Rendered as Persian words in the Nastaliq font, not digits — harder for digit-based OCR to crack
- 🎨 Randomized background/foreground colors with a built-in contrast check, so the text never becomes unreadable
- 🌪 Visual noise: scattered dots + interference lines to defeat naive image-based bots
- 📐 Auto-fitting font size and slight random rotation for additional distortion
- 🖼 Outputs a plain PNG `Buffer` — works with any web framework

---

## Installation

```bash
npm install nastaliq-captcha
```

This package depends on [`canvas`](https://www.npmjs.com/package/canvas) for image rendering, which uses native bindings. On most systems this installs automatically via `npm install`, but if you hit build errors, see node-canvas's [platform-specific setup guide](https://github.com/Automattic/node-canvas#compiling) (Cairo/Pango system libraries are required on Linux/macOS).

---

## Quick start

```typescript
import { NastaliqCaptcha } from "nastaliq-captcha";

const captcha = new NastaliqCaptcha();

const { image, answer } = captcha.generate();
// image  -> PNG Buffer, send this to the client
// answer -> Persian text string, e.g. "چهارصد و نوزده"
```

### Custom dimensions

```typescript
const { image, answer } = captcha.generate({
  width: 240,
  height: 80,
});
```

Both `width` and `height` are optional and independently default to `200` and `60` respectively.

---

## ⚠️ Important: handling the answer securely

`generate()` returns both the rendered `image` **and** the plaintext `answer` in the same object. This is intentional — the package itself doesn't assume how you store sessions — but it means **the calling code is responsible for keeping `answer` away from the client.**

If you send the full `{ image, answer }` object straight back in an API response, the CAPTCHA provides no protection at all: anyone can read the answer directly out of the response body without ever looking at the image.

### ✅ Correct usage pattern

Generate the challenge, store the answer server-side (session, cache, or database) keyed by some challenge ID, and send **only the image** to the client:

```typescript
import { NastaliqCaptcha } from "nastaliq-captcha";
import { randomUUID } from "crypto";

const captcha = new NastaliqCaptcha();

// --- On challenge creation (e.g. GET /captcha) ---
app.get("/captcha", (req, res) => {
  const { image, answer } = captcha.generate();
  const challengeId = randomUUID();

  // Store server-side only — e.g. in Redis, a session store, or a short-lived DB row.
  // Example using an in-memory session for illustration:
  req.session.captcha = { id: challengeId, answer };

  res.set("Content-Type", "image/png");
  res.json({
    challengeId,
    image: image.toString("base64"), // or stream the Buffer directly
  });
});

// --- On verification (e.g. POST /captcha/verify) ---
app.post("/captcha/verify", (req, res) => {
  const { challengeId, userAnswer } = req.body;
  const stored = req.session.captcha;

  if (!stored || stored.id !== challengeId) {
    return res.status(400).json({ valid: false, reason: "Challenge expired or not found" });
  }

  const valid = stored.answer === userAnswer;
  delete req.session.captcha; // one-time use

  res.json({ valid });
});
```

### ❌ Avoid this

```typescript
// DON'T: ships the answer to the client alongside the image.
app.get("/captcha", (req, res) => {
  const { image, answer } = captcha.generate();
  res.json({ image: image.toString("base64"), answer }); // anyone can read `answer` here
});
```

---

## API

### `new NastaliqCaptcha()`

Creates a new CAPTCHA generator instance. No configuration needed at construction time.

### `.generate(config?)`

Generates a new random challenge and renders it as an image.

| Param           | Type     | Default | Description                   |
| --------------- | -------- | ------- | ----------------------------- |
| `config.width`  | `number` | `200`   | Output image width in pixels  |
| `config.height` | `number` | `60`    | Output image height in pixels |

**Returns** `{ image: Buffer; answer: string }`

| Field    | Type     | Description                                                                                                                                                        |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `image`  | `Buffer` | PNG image buffer                                                                                                                                                   |
| `answer` | `string` | The correct answer, in Persian words (e.g. `"بیست و سه"`). Handle this server-side only — see [security section](#️-important-handling-the-answer-securely) above. |

---

## How it works

1. **`CaptchaCore`** picks a random number and converts it to Persian words via `numberToPersian()`.
2. **`CanvasRenderer`** draws that text onto a canvas with a randomized, contrast-checked color pair, adds noise (dots + curved lines), fits the font size to the canvas, and applies a slight random rotation before exporting a PNG buffer.
3. **`NastaliqCaptcha`** ties the two together and exposes the single `generate()` entry point.

```
NastaliqCaptcha.generate()
  ├─ CaptchaCore.create()        → { answer, raw }
  └─ CanvasRenderer.render()     → PNG Buffer
```

### Known limitation

The generated number range is documented as 100–999, but currently produces **100–998** (the upper bound of `crypto.randomInt` is exclusive). This doesn't affect usage — just noting it in case you're relying on 999 being a possible value.

---

## Testing

```bash
npm install -D jest ts-jest @types/jest typescript @types/node
npx jest
```

Tests mock the native `canvas` dependency, so the suite runs without needing Cairo/Pango or the Nastaliq font file installed.

---

## Requirements

- Node.js (with `crypto.randomInt` support — Node 14.10+)
- A Nastaliq-compatible `.ttf` font file at `src/assets/fonts/nastaliq.ttf` (bundled with the package)

---

## License

Nastaliq CAPTCHA is source-available package. The source code is publicly visible for transparency and contribution purposes, but redistribution, derivative works, and competing products are prohibited without permission.
