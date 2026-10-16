/**
 * Retake the README / Web Store screenshots from examples/demo in the real extension.
 *
 *   npm i --no-save puppeteer-core     # not a dependency of the project
 *   npm run screenshots [-- image link-card]
 *
 * Needs Chrome for Testing or Chromium (branded Chrome 137+ ignores --load-extension). It is found in
 * ~/.cache/puppeteer, or set CHROME=/path/to/binary. The folder picker is a native dialog, so the demo
 * folder is copied into the browser's private file system and handed to the extension in its place.
 * Link cards need a network: they read GitHub's and YouTube's public APIs.
 */
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..');
const DEMO = join(ROOT, 'examples/demo');
const OUT = join(ROOT, 'docs/screenshots');
const FOLDER = 'orders-service'; // the name the tree shows, as in the existing screenshots

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * name → { theme, toc, run }: the saved theme and outline panel, and what to do on a page that has the demo
 * folder open. The page is saved as docs/screenshots/<name>.png. These seven are the ones the README and the
 * Web Store listing use.
 */
const SHOTS = {
  markdown: {
    run: (page) => openFile(page, 'README.md'),
  },
  mermaid: {
    run: async (page) => {
      await openFile(page, 'docs/architecture.md');
      await page.waitForSelector('.mermaid svg', { timeout: 15000 });
    },
  },
  json: {
    run: async (page) => {
      await openFile(page, 'data/orders.json');
      await page.locator('::-p-text(Expand all)').click();
    },
  },
  'dark-outline': {
    theme: 'dark', toc: 'on',
    run: (page) => openFile(page, 'README.md'),
  },
  'quick-open': {
    theme: 'dark', toc: 'on',
    run: async (page) => {
      await openFile(page, 'README.md');
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyK');
      await page.keyboard.up('Control');
      await page.keyboard.type('arch', { delay: 60 });
    },
  },
  image: {
    run: async (page) => {
      await openFile(page, 'assets/logo.svg');
      await page.waitForSelector('img.picture');
    },
  },
  'link-card': {
    run: async (page) => {
      await openFile(page, 'docs/links.md');
      await page.waitForFunction(() => document.querySelector('a.video-card img')?.naturalWidth > 0, { timeout: 15000 });
      await page.evaluate(() => {
        const h = [...document.querySelectorAll('#markdown-body h2')].find((h) => h.textContent === 'Hover cards');
        document.getElementById('content-wrapper').scrollTop = h.offsetTop - 100;
      });
      await sleep(800); // let the scroll settle: a scroll event after the hover would hide the card again
      await page.hover('a[data-card$="doctree"]');
      await page.waitForSelector('#link-card:not([hidden])', { timeout: 15000 });
      // Taking the screenshot nudges the pointer off the link, which would hide the card; keep it.
      await page.evaluate(() => document.addEventListener('mouseout', (e) => e.stopImmediatePropagation(), true));
    },
  },
};

async function openFile(page, rel) {
  await page.evaluate((r) => { location.hash = '#' + r; }, rel);
  await sleep(1500);
}

function demoFiles(dir = DEMO) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? demoFiles(p) : [relative(DEMO, p)];
  });
}

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = join(homedir(), '.cache/puppeteer/chrome');
  const dirs = readdirSync(base).sort().reverse();
  for (const d of dirs) {
    const app = join(base, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    try { statSync(app); return app; } catch { /* try the next one */ }
  }
  throw new Error('No Chrome for Testing found in ~/.cache/puppeteer; set CHROME=/path/to/binary');
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
for (const n of names) if (!SHOTS[n]) throw new Error(`Unknown shot "${n}". Known: ${Object.keys(SHOTS).join(', ')}`);

let puppeteer;
try {
  puppeteer = (await import('puppeteer-core')).default;
} catch {
  throw new Error('puppeteer-core is missing. Run: npm i --no-save puppeteer-core');
}

// Serves the demo folder to the extension page, which copies it into its private file system.
const server = createServer((req, res) => {
  try {
    const file = resolve(DEMO + decodeURIComponent(req.url));
    if (!file.startsWith(DEMO + '/')) throw new Error('outside the demo folder');
    res.setHeader('access-control-allow-origin', '*');
    res.end(readFileSync(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const profile = mkdtempSync(join(tmpdir(), 'doctree-shots-'));
const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: false,
  userDataDir: profile,
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--load-extension=${ROOT}`, `--disable-extensions-except=${ROOT}`],
});

try {
  const worker = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('background/service_worker.js'));
  const viewer = `chrome-extension://${new URL(worker.url()).host}/viewer/viewer.html`;
  const page = await browser.newPage();

  await page.goto(viewer);
  await page.evaluate(async (files, folder, base) => {
    const opfs = await navigator.storage.getDirectory();
    const demo = await opfs.getDirectoryHandle(folder, { create: true });
    for (const f of files) {
      const parts = f.split(/[\\/]/);
      let dir = demo;
      for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
      const w = await (await dir.getFileHandle(parts.at(-1), { create: true })).createWritable();
      await w.write(await (await fetch(base + parts.map(encodeURIComponent).join('/'))).arrayBuffer());
      await w.close();
    }
    localStorage.clear();
  }, demoFiles(), FOLDER, base);

  for (const name of names) {
    const { theme = 'light', toc = 'off', run } = SHOTS[name];
    await page.evaluate((theme, toc) => {
      localStorage.setItem('doctree-theme', theme); // theme.js reads it before first paint, so load again below
      localStorage.setItem('doctree-toc', toc);
    }, theme, toc);
    await page.goto(viewer); // a fresh page per shot: no leftover hover, scroll or open folder
    await page.evaluate(async (folder) => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder);
      window.showDirectoryPicker = async () => dir;
    }, FOLDER);
    await page.click('#open-folder-btn');
    await page.waitForSelector('#tree a, #tree button, #tree [role]', { timeout: 10000 }).catch(() => sleep(1500));
    await sleep(1000);
    await run(page);
    await sleep(500);
    await page.screenshot({ path: join(OUT, `${name}.png`), captureBeyondViewport: false }); // the default capture fires a scroll, which hides the hover card
    console.log('wrote docs/screenshots/' + name + '.png');
  }
} finally {
  await browser.close();
  server.close();
  rmSync(profile, { recursive: true, force: true });
}
