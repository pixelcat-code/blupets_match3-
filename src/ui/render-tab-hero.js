// Shared "tab hero" banners shown atop the leaderboard, collection, quests, and
// tournament-lobby screens. Same recipe as the guide-hero (.guide-hero in
// render-guide.js): a decorative composed-sprite art panel plus a copy block.
// Pure HTML-string builder — no DOM, no imports from main.js. Callers prepend
// the returned <section> into their screen container.

const pet = (asset, cls, extra = "") =>
  `<img class="pet${cls ? ` ${cls}` : ""}" src="${asset}" alt=""${extra ? ` ${extra}` : ""} />`;

// Real asset paths (mockup used base64; the live app loads ./assets directly).
const ART = {
  gold: "./assets/evolution/solar/t2/00-gold.svg",
  silver: "./assets/evolution/pale/t2/03-pearl.svg",
  bronze: "./assets/evolution/orange/t2/03-copper.svg",
  ice: "./assets/evolution/frost/t2/00-ice.svg",
  fire: "./assets/evolution/heat/t2/00-fire.svg",
  green: "./assets/blocks/green.svg",
};

const SCENES = {
  guide: {
    extraClass: "hero-guide",
    title: "Match, evolve, collect",
    sub: "Build strong runs, reveal Blupets, and turn duplicates into collection progress.",
    art: `
      <div class="guide-scene">
        <img class="g-capsule" src="./assets/blocks/origin.svg" alt="" />
        <img class="g-block g-block--1" src="./assets/blocks/blue.svg" alt="" />
        <img class="g-block g-block--2" src="./assets/blocks/yellow.svg" alt="" />
        <img class="g-block g-block--3" src="./assets/blocks/purple.svg" alt="" />
      </div>`,
  },
  leaderboard: {
    extraClass: "hero-rank",
    title: "Climb the ranks",
    sub: "The top runs from every player — gold, silver, bronze.",
    art: `
      <div class="podium">
        <div class="col col--2">${pet(ART.silver, "p-silver")}<span class="block"><span class="rank">2</span></span></div>
        <div class="col col--1"><span class="crown"></span>${pet(ART.gold, "p-gold")}<span class="block"><span class="rank">1</span></span></div>
        <div class="col col--3">${pet(ART.bronze, "p-bronze")}<span class="block"><span class="rank">3</span></span></div>
      </div>`,
  },
  collection: {
    extraClass: "hero-collection",
    title: "The Blupet gallery",
    sub: "Reveal every form and fill the hall.",
    art: `
      <div class="gallery">
        <span class="rail"></span>
        <figure class="frame frame--a"><span class="wire"></span><span class="mat">${pet(ART.fire, "")}</span></figure>
        <figure class="frame frame--b"><span class="wire"></span><span class="mat">${pet(ART.gold, "")}</span></figure>
        <figure class="frame frame--c"><span class="wire"></span><span class="mat">${pet(ART.ice, "")}</span></figure>
      </div>`,
  },
  quests: {
    extraClass: "hero-quests",
    title: "Quests",
    sub: "Clear challenges, earn capsules.",
    art: `
      <div class="quest-scene">
        ${pet(ART.green, "q-pet")}
        <div class="checklist">
          <div class="q-row done"><span class="box"></span><span class="bar"></span></div>
          <div class="q-row done"><span class="box"></span><span class="bar bar--short"></span></div>
          <div class="q-row"><span class="box"></span><span class="bar bar--mid"></span></div>
        </div>
      </div>`,
  },
  lobby: {
    extraClass: "hero-lobby",
    title: "Enter the lobby",
    sub: "Go head-to-head in a live tournament.",
    art: `
      <div class="versus">
        ${pet(ART.fire, "v-left")}
        <span class="vs"><b>VS</b></span>
        ${pet(ART.ice, "v-right")}
      </div>`,
  },
};

export function renderTabHero(kind, { back = false } = {}) {
  const scene = SCENES[kind];
  if (!scene) return "";
  const backBtn = back
    ? `<button class="tab-hero-back" type="button" data-hero-back aria-label="Back">←</button>`
    : "";
  return `
    <section class="tab-hero ${scene.extraClass}">
      ${backBtn}
      <div class="tab-hero-art" aria-hidden="true">
        <span class="tab-hero-glow"></span>${scene.art}
      </div>
      <div class="tab-hero-copy">
        <strong>${scene.title}</strong>
        <span>${scene.sub}</span>
      </div>
    </section>`;
}
