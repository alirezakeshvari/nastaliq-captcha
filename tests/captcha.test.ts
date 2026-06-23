import { NastaliqCaptcha } from "../src";
import { CaptchaCore } from "../src/core/captcha";
import { numberToPersian } from "../src/utils/number-to-persian";

// ---------------------------------------------------------------------------
// Mock the native `canvas` package.
//
// `canvas` requires compiled native bindings (Cairo/Pango), so we don't want
// unit tests depending on it being available in every environment. We fake
// just enough of the Canvas 2D API for CanvasRenderer to run, while tracking
// calls so tests can assert on drawing behaviour.
//
// Key mock decisions:
//
//  - measureText() scales with the current font size so the shrink-to-fit
//    loop (`while (measureTotal() > width - padding * 2 ...)`) actually
//    converges instead of running forever.
//
//  - getImageData() returns a zeroed Uint8ClampedArray of the right size so
//    the pixel-warp post-processing loop has real-shaped data to iterate over.
//    createImageData() returns the same shape for the destination buffer.
//
//  - save() / restore() are no-ops but are tracked so tests can assert on
//    the number of per-word context saves.
//
//  - scale() is a no-op but tracked for completeness.
// ---------------------------------------------------------------------------
jest.mock("canvas", () => {
  // Canvas dimensions are set by createCanvas and read back by getImageData.
  let _width = 200;
  let _height = 60;

  const mockContext = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    textAlign: "",
    textBaseline: "",
    font: "10px Nastaliq",
    shadowColor: "",
    shadowBlur: 0,
    globalAlpha: 1,

    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    bezierCurveTo: jest.fn(),
    stroke: jest.fn(),
    fillText: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    scale: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    putImageData: jest.fn(),

    measureText: jest.fn((text: string) => {
      const match = /(\d+)px/.exec(mockContext.font);
      const fontSize = match ? parseInt(match[1], 10) : 10;
      // Approximate width proportional to font size × char count so the
      // shrink-to-fit loop in CanvasRenderer converges naturally.
      return { width: fontSize * text.length * 0.6 };
    }),

    getImageData: jest.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
    })),

    createImageData: jest.fn((w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
    })),
  };

  const mockCanvas = {
    get width() {
      return _width;
    },
    get height() {
      return _height;
    },
    getContext: jest.fn(() => mockContext),
    toBuffer: jest.fn(() => Buffer.from("fake-png-data")),
  };

  return {
    createCanvas: jest.fn((w: number, h: number) => {
      _width = w;
      _height = h;
      return mockCanvas;
    }),
    registerFont: jest.fn(),
    __mockContext: mockContext,
    __mockCanvas: mockCanvas,
  };
});

import { CanvasRenderer } from "../src/renderers/canvas.renderer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the expected dot count for a given difficulty level using the same
 * linear interpolation as CanvasRenderer.buildParams():
 *   dotCount = round(200 + (5000 - 200) * (d / 10))
 */
function expectedDotCount(difficulty: number): number {
  return Math.round(200 + (5000 - 200) * (difficulty / 10));
}

/**
 * Returns the expected line count for a given difficulty level:
 *   lineCount = round(2 + (18 - 2) * (d / 10))
 */
function expectedLineCount(difficulty: number): number {
  return Math.round(2 + (18 - 2) * (difficulty / 10));
}

/**
 * Returns the expected ghost count for a given difficulty level:
 *   ghostCount = round(0 + 3 * (d / 10))
 */
function expectedGhostCount(difficulty: number): number {
  return Math.round(3 * (difficulty / 10));
}

// ---------------------------------------------------------------------------
// numberToPersian
// ---------------------------------------------------------------------------

describe("numberToPersian", () => {
  it("converts numbers under 20 directly from the units table", () => {
    expect(numberToPersian(0)).toBe("");
    expect(numberToPersian(1)).toBe("یک");
    expect(numberToPersian(7)).toBe("هفت");
    expect(numberToPersian(19)).toBe("نوزده");
  });

  it("converts round tens (20-90) with no unit suffix", () => {
    expect(numberToPersian(20)).toBe("بیست");
    expect(numberToPersian(30)).toBe("سی");
    expect(numberToPersian(90)).toBe("نود");
  });

  it("combines tens and units with 'و' for non-round tens", () => {
    expect(numberToPersian(21)).toBe("بیست و یک");
    expect(numberToPersian(32)).toBe("سی و دو");
    expect(numberToPersian(99)).toBe("نود و نه");
  });

  it("converts round hundreds (100-900) with no remainder suffix", () => {
    expect(numberToPersian(100)).toBe("صد");
    expect(numberToPersian(200)).toBe("دویست");
    expect(numberToPersian(900)).toBe("نهصد");
  });

  it("combines hundreds with a remainder under 20", () => {
    expect(numberToPersian(101)).toBe("صد و یک");
    expect(numberToPersian(419)).toBe("چهارصد و نوزده");
  });

  it("combines hundreds with a remainder in the tens range", () => {
    expect(numberToPersian(432)).toBe("چهارصد و سی و دو");
    expect(numberToPersian(990)).toBe("نهصد و نود");
  });

  it("covers every hundreds-digit word (1-9)", () => {
    expect(numberToPersian(100)).toBe("صد");
    expect(numberToPersian(200)).toBe("دویست");
    expect(numberToPersian(300)).toBe("سیصد");
    expect(numberToPersian(400)).toBe("چهارصد");
    expect(numberToPersian(500)).toBe("پانصد");
    expect(numberToPersian(600)).toBe("ششصد");
    expect(numberToPersian(700)).toBe("هفتصد");
    expect(numberToPersian(800)).toBe("هشتصد");
    expect(numberToPersian(900)).toBe("نهصد");
  });

  it("falls back to the plain numeric string for 1000 and above", () => {
    expect(numberToPersian(1000)).toBe("1000");
    expect(numberToPersian(12345)).toBe("12345");
  });
});

// ---------------------------------------------------------------------------
// CaptchaCore
// ---------------------------------------------------------------------------

describe("CaptchaCore", () => {
  it("returns an answer/raw pair where answer is the Persian form of raw", () => {
    const core = new CaptchaCore();
    const { answer, raw } = core.create();
    expect(typeof raw).toBe("number");
    expect(typeof answer).toBe("string");
    expect(answer).toBe(numberToPersian(raw));
  });

  it("always generates raw within the documented range (100-999 inclusive)", () => {
    const core = new CaptchaCore();
    for (let i = 0; i < 200; i++) {
      const { raw } = core.create();
      expect(raw).toBeGreaterThanOrEqual(100);
      expect(raw).toBeLessThan(1000);
    }
  });

  it("produces a non-empty answer string for every generated raw value", () => {
    const core = new CaptchaCore();
    for (let i = 0; i < 50; i++) {
      const { answer } = core.create();
      expect(answer.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// CanvasRenderer
// ---------------------------------------------------------------------------

describe("CanvasRenderer", () => {
  let renderer: CanvasRenderer;

  beforeEach(() => {
    renderer = new CanvasRenderer();
    jest.clearAllMocks();
  });

  // ── Basic output ──────────────────────────────────────────────────────────

  it("returns a Buffer", () => {
    const result = renderer.render("هفت", 200, 60, 5);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("creates the canvas with the requested dimensions", () => {
    const { createCanvas } = jest.requireMock("canvas") as any;
    renderer.render("سی و دو", 240, 80, 5);
    expect(createCanvas).toHaveBeenCalledWith(240, 80);
  });

  // ── Text drawing ──────────────────────────────────────────────────────────

  it("calls fillText for every word in the input", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    // "سی و دو" has three words; each should produce one fillText call
    // (ghost count at difficulty 5 adds extra fillText calls but those are
    // for the whole string, not individual words — see ghost test below).
    renderer.render("سی و دو", 200, 60, 0); // difficulty 0 → no ghosts

    const calls: string[] = __mockContext.fillText.mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContain("سی");
    expect(calls).toContain("و");
    expect(calls).toContain("دو");
  });

  it("wraps each word in save/restore", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    const words = "یک دو سه".split(" "); // 3 words
    renderer.render("یک دو سه", 200, 60, 0); // difficulty 0 → no ghost saves

    // One save/restore pair per word.
    expect(__mockContext.save).toHaveBeenCalledTimes(words.length);
    expect(__mockContext.restore).toHaveBeenCalledTimes(words.length);
  });

  it("uses scale() for per-word distortion", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("یک دو", 200, 60, 10); // difficulty 10 → scale variance > 0
    expect(__mockContext.scale).toHaveBeenCalled();
  });

  it("fills the background before drawing any text", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("یک", 200, 60, 0);

    const firstFillRect = __mockContext.fillRect.mock.invocationCallOrder[0];
    const firstFillText = __mockContext.fillText.mock.invocationCallOrder[0];
    expect(firstFillRect).toBeLessThan(firstFillText);
  });

  // ── Noise scaling with difficulty ─────────────────────────────────────────

  it("draws the correct dot count for difficulty 0", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("دو", 200, 60, 0);

    const dots = expectedDotCount(0); // 200
    // dots + 1 background fillRect
    expect(__mockContext.fillRect).toHaveBeenCalledTimes(dots + 1);
  });

  it("draws the correct dot count for difficulty 5 (default)", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("دو", 200, 60, 5);

    const dots = expectedDotCount(5); // 2500
    expect(__mockContext.fillRect).toHaveBeenCalledTimes(dots + 1);
  });

  it("draws the correct dot count for difficulty 10", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("دو", 200, 60, 10);

    const dots = expectedDotCount(10); // 5000
    expect(__mockContext.fillRect).toHaveBeenCalledTimes(dots + 1);
  });

  it("draws the correct line count for difficulty 0", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("دو", 200, 60, 0);
    expect(__mockContext.stroke).toHaveBeenCalledTimes(expectedLineCount(0));
  });

  it("draws the correct line count for difficulty 10", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("دو", 200, 60, 10);
    expect(__mockContext.stroke).toHaveBeenCalledTimes(expectedLineCount(10));
  });

  // ── Ghost / decoy layers ──────────────────────────────────────────────────

  it("draws no ghost layers at difficulty 0", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("یک", 200, 60, 0);

    // At d=0, ghostCount=0. The only fillText calls should be the real words.
    const wordCount = "یک".split(/\s+/).length;
    expect(__mockContext.fillText).toHaveBeenCalledTimes(wordCount);
  });

  it("draws ghost layers at difficulty 10", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("یک", 200, 60, 10);

    const ghosts = expectedGhostCount(10); // 3
    const wordCount = 1;
    // Each ghost draws the full text string once, plus one call per real word.
    expect(__mockContext.fillText).toHaveBeenCalledTimes(ghosts + wordCount);
  });

  // ── Pixel-warp ────────────────────────────────────────────────────────────

  it("skips the pixel-warp (no getImageData) at difficulty 0", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("یک", 200, 60, 0);
    expect(__mockContext.getImageData).not.toHaveBeenCalled();
  });

  it("applies the pixel-warp (calls getImageData) at difficulty > 0", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("یک", 200, 60, 5);
    expect(__mockContext.getImageData).toHaveBeenCalled();
  });

  it("writes warped pixels back with putImageData at difficulty > 0", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("یک", 200, 60, 5);
    expect(__mockContext.putImageData).toHaveBeenCalled();
  });

  // ── Difficulty clamping ───────────────────────────────────────────────────

  it("clamps difficulty below 0 to 0", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("دو", 200, 60, -5);
    // Should behave identically to difficulty 0.
    expect(__mockContext.fillRect).toHaveBeenCalledTimes(expectedDotCount(0) + 1);
  });

  it("clamps difficulty above 10 to 10", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("دو", 200, 60, 99);
    expect(__mockContext.fillRect).toHaveBeenCalledTimes(expectedDotCount(10) + 1);
  });

  // ── Font fitting ──────────────────────────────────────────────────────────

  it("shrinks the font until the text fits within the canvas width", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("نهصد و نود و نه و هشتاد و هشت", 200, 60, 0);

    const match = /(\d+)px/.exec(__mockContext.font);
    const finalSize = match ? parseInt(match[1], 10) : NaN;
    expect(finalSize).toBeLessThan(100);
    expect(finalSize).toBeGreaterThan(0);
  });

  it("terminates without throwing for very short text", () => {
    expect(() => renderer.render("یک", 200, 60, 5)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// NastaliqCaptcha (integration)
// ---------------------------------------------------------------------------

describe("NastaliqCaptcha (integration)", () => {
  const captcha = new NastaliqCaptcha();

  it("works with a full config object", () => {
    const { image, answer } = captcha.generate({ width: 200, height: 60, difficulty: 5 });
    expect(Buffer.isBuffer(image)).toBe(true);
    expect(typeof answer).toBe("number");
  });

  it("works without any config", () => {
    const { image, answer } = captcha.generate();
    expect(Buffer.isBuffer(image)).toBe(true);
    expect(typeof answer).toBe("number");
  });

  it("applies default dimensions (200×60) when no config is given", () => {
    const { createCanvas } = jest.requireMock("canvas") as any;
    createCanvas.mockClear();

    captcha.generate();

    expect(createCanvas).toHaveBeenCalledWith(200, 60);
  });

  it("applies partial config, defaulting any omitted dimension", () => {
    const { createCanvas } = jest.requireMock("canvas") as any;
    createCanvas.mockClear();

    captcha.generate({ width: 300 }); // height omitted → should default to 60
    expect(createCanvas).toHaveBeenCalledWith(300, 60);
  });

  it("applies default difficulty (5) when omitted from config", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    jest.clearAllMocks();

    captcha.generate({ width: 200, height: 60 }); // difficulty omitted
    expect(__mockContext.fillRect).toHaveBeenCalledTimes(expectedDotCount(5) + 1);
  });

  it("passes difficulty through to the renderer", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    jest.clearAllMocks();

    captcha.generate({ difficulty: 0 });
    expect(__mockContext.fillRect).toHaveBeenCalledTimes(expectedDotCount(0) + 1);
  });

  it("returns the raw number as the answer, not the Persian text", () => {
    const { answer } = captcha.generate();
    expect(typeof answer).toBe("number");
  });
});
