const Buffer = require("buffer").Buffer;
const { createCanvas, registerFont } = require("canvas");
const PersianNumberToString = require("persian-number-tostring");
const randomColor = require("randomcolor");
const path = require('path');

registerFont(
  path.join(__dirname, "IranNastaliq.ttf"),
  { family: "IranNastaliq" }
);

const invertColor = (col) => {
  col = col.toLowerCase();
  const colors = [
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
  ];
  let inverseColor = "#";
  col
    .replace("#", "")
    .split("")
    .forEach((i) => {
      const index = colors.indexOf(i);
      inverseColor += colors.reverse()[index];
    });
  return inverseColor;
};

function createCaptcha(...args) {
  let width, height, from, to, lines;

  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
    // ورودی به صورت آبجکت
    ({ width, height, from, to, lines = 0 } = args[0]);
  } else {
    // ورودی به صورت پارامترهای جدا
    [width, height, from, to, lines = 0] = args;
  }

  // ادامه کد تو (بدون تغییر):
  let number = String(Math.floor(Math.random() * (to - from) + from));
  if (number.split("").includes("0")) {
    number = number.replaceAll("0", Math.floor(Math.random() * 8 + 1));
  }
  const text = PersianNumberToString(number);
  const bgColor = randomColor();
  const textColor = invertColor(bgColor);

  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = bgColor;
  context.fillRect(0, 0, width, height);
  let fontSize = 100;
  const font = "IranNastaliq";
  do {
    fontSize--;
    context.font = `${fontSize}px ${font}`;
  } while (context.measureText(text).width > canvas.width - 20);

  context.textBaseline = "middle";
  context.textAlign = "center";
  context.fillStyle = textColor;
  context.fillText(text, width / 2, height / 1.6);

  // lines
  for (let lineIndex = 0; lineIndex < lines; lineIndex++) {
    context.beginPath();
    context.moveTo(
      Math.floor(Math.random() * (width / 10)),
      Math.floor(Math.random() * height)
    );
    context.lineTo(
      Math.floor(Math.random() * (width - width / 1.2) + width / 1.2),
      Math.floor(Math.random() * height)
    );
    context.lineWidth = Math.floor(Math.random() * 2 + 1);
    context.strokeStyle = randomColor();
    context.stroke();
  }

  const imgBuffer = canvas.toBuffer("image/png");
  return {
    number,
    image: Buffer.from(imgBuffer).toString("base64"),
  };
}

module.exports = { createCaptcha };
