# Nastaliq Captcha

A simple offline captcha in persian.

# How to install

```bash
npm install --save nastaliq-captcha
```

# How to use :

```js
const express = require("express");
const Buffer = require("buffer").Buffer;
const { createCaptcha } = require("nastaliq-captcha");

const app = express();
const port = 4000;

app.get("/captcha", (req, res) => {
  const captcha = createCaptcha({
    width: 150,
    height: 50,
    from: 100,
    to: 999,
    lines: 3,
  });
  const number = captcha.number; // You can store it in a session and compare with user answer
  const image = new Buffer(captcha.image, "base64");

  res.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": image.length,
  });

  res.end(image);
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
```

## Output :

[![captcha](https://iili.io/iSKNNp.png)](https://freeimage.host/)
