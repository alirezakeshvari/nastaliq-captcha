const fs = require("fs");
const { createCanvas, registerFont } = require("canvas");
const PersianNumberToString = require("persian-number-tostring");
const randomColor = require("randomcolor");
registerFont("./IranNastaliq.ttf", { family: "IranNastaliq" });

const createCaptcha = (width, height, from, to, path) => {
  const number = Math.floor(Math.random() * (to - from) + from);
  const text = PersianNumberToString(number);

  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = randomColor();
  context.fillRect(0, 0, width, height);
  let fontSize = 300;
  do {
    fontSize--;
    context.font = fontSize + "px IranNastaliq";
  } while (context.measureText(text).width > canvas.width - 20);
  do {
    fontSize--;
    context.font = fontSize + "px IranNastaliq";
  } while (context.measureText(text).height > canvas.height - 10);

  context.textBaseline = "middle";
  context.textAlign = "center";
  context.fillStyle = randomColor();
  context.fillText(text, width / 2, height / 1.6);
  const imgBuffer = canvas.toBuffer("image/png");
  fs.writeFileSync(path, imgBuffer);
  return number;
};

module.exports = { createCaptcha };
