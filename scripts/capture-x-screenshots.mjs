import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:4174";
const OUT = "output/playwright";

const progressSeed = {
  forms: {
    T4_VYNBLOOM: {
      name: "Vynbloom",
      asset: "./assets/evolution/violet/t4/00-vynbloom.svg",
      color: "red",
      partner: "blue",
      count: 1,
      firstAt: Date.now(),
    },
    T4_PYRONIX: {
      name: "Pyronix",
      asset: "./assets/evolution/heat/t4/00-pyronix.svg",
      color: "red",
      partner: "red",
      count: 1,
      firstAt: Date.now(),
    },
    T4_GOLDION: {
      name: "Goldion",
      asset: "./assets/evolution/solar/t4/00-goldion.svg",
      color: "yellow",
      partner: "yellow",
      count: 1,
      firstAt: Date.now(),
    },
  },
  runs: 9,
  wins: 3,
  bestScore: 7420,
  fewestMovesWin: 18,
};

async function waitForImages(page) {
  await page.evaluate(async () => {
    const images = [...document.images].filter((img) => !img.complete);
    await Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          }),
      ),
    );
  });
}

async function installShotStyles(page) {
  await page.addStyleTag({
    content: `
      .x-shot-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 9999;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .x-shot-label {
        position: absolute;
        max-width: 290px;
        padding: 10px 12px;
        border: 2px solid rgba(255, 255, 255, 0.92);
        border-radius: 10px;
        background: rgba(16, 23, 42, 0.88);
        color: #fff;
        box-shadow: 0 12px 32px rgba(20, 47, 94, 0.28);
        font-size: 16px;
        line-height: 1.25;
        text-wrap: balance;
      }
      .x-shot-label strong {
        display: block;
        margin-bottom: 3px;
        color: #8ff4ff;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .x-shot-marker {
        position: absolute;
        border: 3px solid #8ff4ff;
        border-radius: 16px;
        box-shadow: 0 0 0 9999px rgba(6, 16, 38, 0.06), 0 0 28px rgba(143, 244, 255, 0.62);
      }
    `,
  });
}

async function clearMarks(page) {
  await page.evaluate(() => document.querySelectorAll(".x-shot-layer").forEach((node) => node.remove()));
}

async function addLabel(page, selector, html, placement = "right") {
  await page.evaluate(
    ({ selector, html, placement }) => {
      let layer = document.querySelector(".x-shot-layer");
      if (!layer) {
        layer = document.createElement("div");
        layer.className = "x-shot-layer";
        document.body.append(layer);
      }
      const target = document.querySelector(selector);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const marker = document.createElement("div");
      marker.className = "x-shot-marker";
      marker.style.left = `${rect.left - 7}px`;
      marker.style.top = `${rect.top - 7}px`;
      marker.style.width = `${rect.width + 14}px`;
      marker.style.height = `${rect.height + 14}px`;
      layer.append(marker);

      const label = document.createElement("div");
      label.className = "x-shot-label";
      label.innerHTML = html;
      const gap = 16;
      const x =
        placement === "left"
          ? rect.left - 306
          : placement === "center"
            ? rect.left + rect.width / 2 - 145
            : rect.right + gap;
      const y = placement === "bottom" ? rect.bottom + gap : rect.top;
      label.style.left = `${Math.max(18, Math.min(window.innerWidth - 320, x))}px`;
      label.style.top = `${Math.max(18, Math.min(window.innerHeight - 120, y))}px`;
      layer.append(label);
    },
    { selector, html, placement },
  );
}

async function screenshot(page, name) {
  await waitForImages(page);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

async function dismissAuth(page) {
  const skip = page.locator("#authSkipBtn");
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(250);
    return;
  }
  await page.evaluate(() => {
    const modal = document.querySelector("#authModal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      modal.classList.remove("is-open");
    }
  });
}

async function showFusionModal(page) {
  await page.evaluate(() => {
    document.querySelector("#modalPartner").style.display = "flex";
    document.querySelector("#modalForm").style.display = "none";
    document.querySelector("#partnerHeadline").innerHTML = '<span style="color:#ff4d5a">Red</span> is ready';
    document.querySelector("#partnerOptions").innerHTML = `
      <button type="button" class="partner-card">
        <span class="partner-dot" style="background:#3b86f7"></span>
        <span class="partner-name">Blue</span>
        <span class="partner-pts">12 pts</span>
      </button>
      <button type="button" class="partner-card">
        <span class="partner-dot" style="background:#9355ea"></span>
        <span class="partner-name">Purple</span>
        <span class="partner-pts">9 pts</span>
      </button>
      <button type="button" class="partner-card">
        <span class="partner-dot" style="background:#ff4d5a"></span>
        <span class="partner-name">Red</span>
        <span class="partner-pts">8 pts</span>
      </button>
    `;
  });
}

async function showResonanceModal(page) {
  await page.evaluate(() => {
    document.querySelector("#modalPartner").style.display = "none";
    document.querySelector("#modalForm").style.display = "flex";
    document.querySelector("#formHeadline").textContent = "Red + Blue · T3";
    document.querySelector("#formOptions").innerHTML = `
      <button type="button" class="form-card">
        <img class="form-img" src="./assets/evolution/violet/t3/02-nightbloom-venom.svg" alt="" />
        <span class="form-name">Nightbloom Venom</span>
      </button>
      <button type="button" class="form-card">
        <img class="form-img" src="./assets/evolution/violet/t3/01-bruise-mage.svg" alt="" />
        <span class="form-name">Bruise Mage</span>
      </button>
      <button type="button" class="form-card">
        <img class="form-img" src="./assets/evolution/violet/t3/00-grape-hex.svg" alt="" />
        <span class="form-name">Grape Hex</span>
      </button>
    `;
    document.querySelector("#statusText").textContent =
      "Hidden mechanic: same chosen form can synchronize matching colors to the next tier.";
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
await context.addInitScript((seed) => {
  window.localStorage.setItem("blupets-progress-v1", JSON.stringify(seed));
  window.localStorage.setItem("blupets-muted-v1", "true");
}, progressSeed);

const page = await context.newPage();
await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
await installShotStyles(page);
await dismissAuth(page);
await screenshot(page, "x-thread-01-start");

await page.click("#start-run");
await page.waitForSelector("#vibeIntro:not([hidden])");
await addLabel(page, "#vibeIntro", "<strong>Vibe</strong>Каждый ран получает случайный набор бонусов: ходы, essence, score, decay resist.", "left");
await screenshot(page, "x-thread-02-vibe");

await clearMarks(page);
await page.click("#vibeIntroBtn");
await page.waitForSelector("#board .tile");
await addLabel(page, "#colorRoster", "<strong>Essence rings</strong>Матчи наполняют цвет. Заполнил кольцо - цвет готов эволюционировать.", "left");
await addLabel(page, "#reroll-run", "<strong>Egg reroll</strong>Каскады кормят яйцо. Вылупилось - получил reroll charge.", "left");
await addLabel(page, "#board", "<strong>Board</strong>8 базовых цветов как сырой материал Blupets-мира.", "right");
await screenshot(page, "x-thread-03-board-essence-reroll");

await clearMarks(page);
await showFusionModal(page);
await addLabel(page, "#modalPartner", "<strong>Fusion</strong>На T2 выбираешь партнера: два начальных цвета становятся одной семейной линией.", "left");
await screenshot(page, "x-thread-04-fusion-partner");

await clearMarks(page);
await showResonanceModal(page);
await addLabel(page, "#modalForm", "<strong>Form resonance</strong>Если разные цвета выбирают одну форму, они начинают сопоставляться и могут синхронно прыгнуть выше.", "left");
await addLabel(page, "#colorRoster", "<strong>Скрытая механика</strong>Качаешь не один цвет, а связку форм.", "left");
await screenshot(page, "x-thread-05-form-resonance");

await clearMarks(page);
await page.goto(`${BASE_URL}?demo=victory`, { waitUntil: "domcontentloaded" });
await installShotStyles(page);
await dismissAuth(page);
await page.waitForSelector("#victoryScreen:not([hidden])");
await addLabel(page, "#victoryShareCard", "<strong>T4 apex</strong>Победа - это вывести Blupet в финальную форму до конца ходов.", "left");
await screenshot(page, "x-thread-06-victory-t4");

await clearMarks(page);
await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
await installShotStyles(page);
await dismissAuth(page);
await page.evaluate(() => {
  document.querySelector("#startScreen").hidden = true;
  document.querySelector("#gameScreen").hidden = true;
  document.querySelector("#victoryScreen").hidden = true;
  document.querySelector("#gameoverScreen").hidden = true;
  document.querySelector("#leaderboardScreen").hidden = true;
  document.querySelector("#profileScreen").hidden = false;
  document.querySelector("#profileName").textContent = "Guest";
  document.querySelector("#profileStatus").textContent = "Local form collection";
  document.querySelector("#profile-content").innerHTML = `
    <div class="profile-stats">
      <div><span>Forms</span><strong>3/36</strong></div>
      <div><span>Wins</span><strong>3</strong></div>
      <div><span>Best</span><strong>7420</strong></div>
    </div>
    <div class="collection-head">
      <span>Discovered apex forms</span>
      <strong>3 / 36</strong>
    </div>
    <div class="collection-grid">
      <div class="collection-card is-owned">
        <div class="collection-art"><img src="./assets/evolution/violet/t4/00-vynbloom.svg" alt="" /></div>
        <span class="collection-name">Vynbloom</span>
      </div>
      <div class="collection-card is-owned">
        <div class="collection-art"><img src="./assets/evolution/heat/t4/00-pyronix.svg" alt="" /></div>
        <span class="collection-name">Pyronix</span>
      </div>
      <div class="collection-card is-owned">
        <div class="collection-art"><img src="./assets/evolution/solar/t4/00-goldion.svg" alt="" /></div>
        <span class="collection-name">Goldion</span>
      </div>
      <div class="collection-card is-locked">
        <div class="collection-art"><img class="collection-art-blurred" src="./assets/evolution/aqua/t4/00-crystala.svg" alt="" /><span class="collection-lock" aria-hidden="true">LOCK</span></div>
        <span class="collection-name">Locked</span>
      </div>
    </div>
  `;
});
await page.waitForSelector("#profileScreen:not([hidden])");
await addLabel(page, "#profile-content", "<strong>Form Gallery</strong>Открытые T4 сохраняются как коллекционный прогресс.", "left");
await screenshot(page, "x-thread-07-form-gallery");

await browser.close();
