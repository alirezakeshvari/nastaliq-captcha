const { createCaptcha } = require('./index');

describe('createCaptcha', () => {
  it('should work with object input', () => {
    const { image, number } = createCaptcha({ width: 200, height: 100, from: 1000, to: 9999, lines: 3 });
    expect(typeof image).toBe('string');
    expect(typeof number).toBe('string');
  });

  it('should work with positional arguments', () => {
    const { image, number } = createCaptcha(200, 100, 1000, 9999, 2);
    expect(typeof image).toBe('string');
    expect(typeof number).toBe('string');
  });
});