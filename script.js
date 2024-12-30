import dotenv from "dotenv";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import https from "https";

dotenv.config();

const logFile = fs.createWriteStream("out.log", { flags: "a" });
const log = (message) => {
  const timestamp = new Date().toISOString();
  logFile.write(`[${timestamp}] ${message}\n`);
  console.log(`[${timestamp}] ${message}`);
};

async function initializeBrowser() {
  return puppeteer.launch({ headless: false });
}

async function navigateToFacebook(page) {
  await page.goto("https://www.facebook.com/", { waitUntil: "networkidle2" });
}

async function loginToFacebook(page, email, password) {
  await page.type("#email", email);
  await page.type("#pass", password);

  await Promise.all([
    page.click('button[name="login"]'),
    page.waitForNavigation({ waitUntil: "networkidle2" }),
  ]);

  // тут має з'являтись recaptcha, але мені зловити її не вийшло. Якби recaptcha виникала, намагався б обходити за допомогою сервісу 2captcha
  if (await page.$('iframe[title="recaptcha"]')) {
    throw new Error("reCAPTCHA блокує доступ.");
  }
}

async function navigateToProfile(page) {
  await page.goto("https://www.facebook.com/me", { waitUntil: "networkidle2" });
}

async function getProfilePicture(page) {
  return page.evaluate(() => {
    const svgImage = document.querySelector(
      'svg[aria-label="Дії з основною світлиною"] image'
    );
    return svgImage ? svgImage.getAttribute("xlink:href") : null;
  });
}

async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https
      .get(url, (response) => {
        if (response.statusCode === 200) {
          response.pipe(file);
          file.on("finish", () => {
            file.close(resolve);
          });
        } else {
          reject(new Error(`Failed to download image: ${response.statusCode}`));
        }
      })
      .on("error", (err) => {
        fs.unlink(filepath, () => reject(err));
      });
  });
}

(async () => {
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;

  const browser = await initializeBrowser();
  const page = await browser.newPage();

  try {
    await navigateToFacebook(page);
    await loginToFacebook(page, email, password);
    await navigateToProfile(page);
    const profilePicUrl = await getProfilePicture(page);

    if (profilePicUrl) {
      const imgFolder = path.resolve(__dirname, "img");

      if (!fs.existsSync(imgFolder)) {
        fs.mkdirSync(imgFolder);
      }

      const imgPath = path.join(imgFolder, "profile_picture.jpg");
      await downloadImage(profilePicUrl, imgPath);
    } else {
      log(`Фотографії нема`);
    }
  } catch (error) {
    log(`Помилка: ${error.message}`);
  } finally {
    await browser.close();
    logFile.end();
  }
})();
