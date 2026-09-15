const { chromium } = require('playwright');

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3001';
const cases = [
  { name: 'desktop', width: 1150, height: 410 },
  { name: 'mobile', width: 390, height: 800 },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const item of cases) {
      const context = await browser.newContext({
        viewport: { width: item.width, height: item.height },
      });
      const page = await context.newPage();

      await page.goto(`${baseUrl}/__visual-lab/students-account?chrome=0`, {
        waitUntil: 'networkidle',
      });
      await page.goto(`${baseUrl}/control-escolar`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(2500);

      const summary = page.locator('.ce-enrollment-summary');
      await summary.waitFor({ state: 'visible', timeout: 15000 });

      const workspace = page.locator('.ce-workspace.has-empty-detail');
      if ((await workspace.count()) !== 1) {
        throw new Error(`${item.name}: falta el estado has-empty-detail del workspace`);
      }

      const summaryText = await summary.innerText();
      for (const label of ['Grado', 'Internos', 'Externos', 'Total']) {
        if (!summaryText.includes(label)) {
          throw new Error(`${item.name}: el resumen no contiene la columna ${label}`);
        }
      }

      const summaryBox = await summary.boundingBox();
      const listBox = await page.locator('.ce-list-card').boundingBox();
      if (!summaryBox || !listBox) {
        throw new Error(`${item.name}: no se pudieron medir lista y resumen`);
      }
      if (item.name === 'desktop' && summaryBox.x <= listBox.x) {
        throw new Error('desktop: el resumen no quedó en la segunda columna');
      }
      if (item.name === 'mobile' && summaryBox.y <= listBox.y) {
        throw new Error('mobile: el resumen no quedó debajo de la lista');
      }

      await page.screenshot({
        path: `/tmp/control-escolar-summary-${item.name}.png`,
        fullPage: true,
      });

      console.log(
        `${item.name}: resumen visible (${Math.round(summaryBox.width)}x${Math.round(summaryBox.height)})`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
