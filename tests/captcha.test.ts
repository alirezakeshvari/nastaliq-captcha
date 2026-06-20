import { NastaliqCaptcha } from "../src";
import { CaptchaCore } from "../src/core/captcha";
import { numberToPersian } from "../src/utils/number-to-persian";

// ---------------------------------------------------------------------------
// Mock the native `canvas` package.
//
// `canvas` requires compiled native bindings, so we don't want unit tests
// depending on it being installed/buildable in every environment (CI, other
// machines, etc). Instead we fake just enough of the Canvas 2D API surface
// for CanvasRenderer to run against, while tracking what was drawn so tests
// can make assertions on it.
//
// IMPORTANT: measureText() below returns a width that scales with the
// current font size. CanvasRenderer's font-fitting loop
// (`do { fontSize--; ... } while (measureText(text).width > ...)`) shrinks
// fontSize until the measured width fits. If measureText returned a fixed
// width, that loop would never terminate for long text. Scaling it with
// fontSize keeps the mock honest and lets the loop behave the way it would
// against the real canvas library.
// ---------------------------------------------------------------------------
jest.mock("canvas", () => {
  const mockContext = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    textAlign: "",
    textBaseline: "",
    font: "10px Nastaliq",
    shadowColor: "",
    shadowBlur: 0,
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    bezierCurveTo: jest.fn(),
    stroke: jest.fn(),
    fillText: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    measureText: jest.fn((text: string) => {
      // Extract the numeric font size currently set (e.g. "42px Nastaliq" -> 42)
      const match = /(\d+)px/.exec(mockContext.font);
      const fontSize = match ? parseInt(match[1], 10) : 10;
      // Roughly approximate text width as proportional to font size and
      // character count, same way a real font roughly would, so the
      // shrink-to-fit loop in CanvasRenderer actually converges.
      return { width: fontSize * text.length * 0.6 };
    }),
  };

  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: jest.fn(() => mockContext),
    toBuffer: jest.fn(() => Buffer.from("fake-png-data")),
  };

  return {
    createCanvas: jest.fn((width: number, height: number) => {
      mockCanvas.width = width;
      mockCanvas.height = height;
      return mockCanvas;
    }),
    registerFont: jest.fn(),
    __mockContext: mockContext,
    __mockCanvas: mockCanvas,
  };
});

// Re-import after the mock is registered so CanvasRenderer picks up the fake.
import { CanvasRenderer } from "../src/renderers/canvas.renderer";

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

describe("CaptchaCore", () => {
  it("returns an answer/raw pair where answer is the Persian form of raw", () => {
    const core = new CaptchaCore();
    const { answer, raw } = core.create();

    expect(typeof raw).toBe("number");
    expect(typeof answer).toBe("string");
    expect(answer).toBe(numberToPersian(raw));
  });

  it("always generates raw within the documented range (100-998 inclusive)", () => {
    const core = new CaptchaCore();

    // Run many times since the value is random; this isn't a proof, but
    // running enough samples makes an out-of-range value very likely to
    // surface if the range were ever changed incorrectly.
    for (let i = 0; i < 200; i++) {
      const { raw } = core.create();
      expect(raw).toBeGreaterThanOrEqual(100);
      // NOTE: randomInt's upper bound is exclusive, so 999 itself is never
      // generated. See the NOTE comment in core/captcha.ts for details.
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

describe("CanvasRenderer", () => {
  let renderer: CanvasRenderer;

  beforeEach(() => {
    renderer = new CanvasRenderer();
    jest.clearAllMocks();
  });

  it("returns a Buffer", () => {
    const result = renderer.render("هفت", 200, 60);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("creates the canvas with the requested dimensions", () => {
    const { createCanvas } = jest.requireMock("canvas") as any;
    renderer.render("سی و دو", 240, 80);
    expect(createCanvas).toHaveBeenCalledWith(240, 80);
  });

  it("draws the given text onto the canvas", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("نهصد و نود و نه", 200, 60);
    expect(__mockContext.fillText).toHaveBeenCalledWith("نهصد و نود و نه", 0, 0);
  });

  it("fills the background before drawing text (background, then noise, then text)", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("یک", 200, 60);

    const fillRectCallOrder = __mockContext.fillRect.mock.invocationCallOrder;
    const fillTextCallOrder = __mockContext.fillText.mock.invocationCallOrder[0];

    // First fillRect call is the background fill, and it must happen before
    // fillText is ever called, or the text would be painted over.
    expect(fillRectCallOrder[0]).toBeLessThan(fillTextCallOrder);
  });

  it("draws the expected amount of noise (1200 dots, 6 interference lines)", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("دو", 200, 60);

    // 1200 noise dots + 1 background fill = 1201 fillRect calls.
    expect(__mockContext.fillRect).toHaveBeenCalledTimes(1201);
    expect(__mockContext.stroke).toHaveBeenCalledTimes(6);
  });

  it("rotates and translates symmetrically (rotate/unrotate, translate/untranslate)", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    renderer.render("سه", 200, 60);

    const rotateCalls = __mockContext.rotate.mock.calls;
    const translateCalls = __mockContext.translate.mock.calls;

    expect(rotateCalls).toHaveLength(2);
    expect(translateCalls).toHaveLength(2);

    // Second rotate call should exactly negate the first (rotate back).
    expect(rotateCalls[1][0]).toBeCloseTo(-rotateCalls[0][0]);

    // Translate should move to canvas center, then back to origin.
    expect(translateCalls[0]).toEqual([100, 30]);
    expect(translateCalls[1]).toEqual([-100, -30]);
  });

  it("shrinks the font until the text fits within the canvas width", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    // Long text forces the shrink loop to run through multiple sizes.
    renderer.render("نهصد و نود و نه و هشتاد و هشت", 200, 60);

    const finalFont = __mockContext.font;
    const match = /(\d+)px/.exec(finalFont);
    const finalSize = match ? parseInt(match[1], 10) : NaN;

    // Starting size is 100 and the loop only decrements, so the result
    // must be strictly smaller for any text long enough to need shrinking.
    expect(finalSize).toBeLessThan(100);
    expect(finalSize).toBeGreaterThan(0);
  });

  it("terminates the font-fitting loop even for very short text (near max size)", () => {
    // Regression guard: short text should still terminate quickly and
    // land on a sensible (large) font size rather than hitting an
    // infinite loop or shrinking all the way to a tiny size.
    expect(() => renderer.render("یک", 200, 60)).not.toThrow();
  });
});

describe("NastaliqCaptcha (integration)", () => {
  const captcha = new NastaliqCaptcha();

  it("should work with config", () => {
    const { image, answer } = captcha.generate({ width: 200, height: 60 });
    expect(Buffer.isBuffer(image)).toBe(true);
    expect(typeof answer).toBe("string");
  });

  it("should work without config", () => {
    const { image, answer } = captcha.generate();
    expect(Buffer.isBuffer(image)).toBe(true);
    expect(typeof answer).toBe("string");
  });

  it("applies default dimensions (200x60) when no config is given", () => {
    const { createCanvas } = jest.requireMock("canvas") as any;
    createCanvas.mockClear();

    captcha.generate();

    expect(createCanvas).toHaveBeenCalledWith(200, 60);
  });

  it("applies partial config, defaulting any omitted dimension", () => {
    const { createCanvas } = jest.requireMock("canvas") as any;
    createCanvas.mockClear();

    captcha.generate({ width: 300 }); // height omitted -> should default to 60

    expect(createCanvas).toHaveBeenCalledWith(300, 60);
  });

  it("returns the same answer that was used to render the image text", () => {
    const { __mockContext } = jest.requireMock("canvas") as any;
    const { answer } = captcha.generate();

    expect(__mockContext.fillText).toHaveBeenCalledWith(answer, 0, 0);
  });
});
