const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });

  const shot = async (page, label) => {
    await page.screenshot({ path: `/tmp/island-${label}.png` });
    console.log(`[shot] ${label}`);
  };

  // Find the result island by walking up from the text node
  const islandMetrics = (page) => page.evaluate(() => {
    const texts = ['Richtig erkannt', 'Leider falsch'];
    for (const text of texts) {
      const el = [...document.querySelectorAll('p, span, div')]
        .find(e => e.childNodes.length === 1 && e.textContent.trim() === text);
      if (el) {
        // Walk up to find the root card (the div with max-h-[60vh] ≈ has overflow-hidden + flex)
        let card = el;
        while (card && card !== document.body) {
          const cs = getComputedStyle(card);
          if (cs.overflow === 'hidden' && cs.display === 'flex' && cs.flexDirection === 'column') {
            const r = card.getBoundingClientRect();
            const header = card.querySelector('.shrink-0');
            const hr = header ? header.getBoundingClientRect() : null;
            return {
              card: { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) },
              header: hr ? { top: Math.round(hr.top), bottom: Math.round(hr.bottom),
                             inViewport: hr.top >= -1 && hr.bottom <= window.innerHeight + 1 } : null,
              viewport: window.innerHeight,
            };
          }
          card = card.parentElement;
        }
      }
    }
    return null;
  });

  const runTest = async (label, width, height) => {
    const page = await browser.newPage();
    await page.setViewportSize({ width, height });
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });

    await page.click('button:has-text("Ersten Fall lösen")');
    await page.waitForSelector('text=Fall starten', { timeout: 8000 });
    await page.locator('button:has-text("Klinik")').first().click();
    await page.waitForSelector('button:has-text("Fall starten →"):not([disabled])', { timeout: 5000 });
    await page.click('button:has-text("Fall starten →")');
    await page.waitForSelector('text=DIAGNOSE STELLEN', { timeout: 45000 });
    await page.waitForTimeout(300);

    const scrollBefore = await page.evaluate(() => document.documentElement.scrollHeight);

    const btnText = await page.locator('.grid-cols-2 button').first().textContent();
    await page.locator('.grid-cols-2 button').first().click({ force: true });
    console.log(`[${label}] Submitted: "${btnText?.trim().slice(0,50)}"`);

    await page.waitForFunction(
      () => document.body.textContent.includes('Richtig erkannt') || document.body.textContent.includes('Leider falsch'),
      { timeout: 20000 }
    );
    await page.waitForTimeout(600);
    await shot(page, `${label}-2-expanded`);

    const scrollAfter = await page.evaluate(() => document.documentElement.scrollHeight);
    const mExp = await islandMetrics(page);
    console.log(`[${label}] EXPANDED:`, JSON.stringify(mExp?.card), '| header:', JSON.stringify(mExp?.header));
    console.log(`[${label}] scrollH: ${scrollBefore}→${scrollAfter} Δ${scrollAfter - scrollBefore}`);

    // Collapse
    await page.click('button:has-text("Details")');
    await page.waitForTimeout(400);
    await shot(page, `${label}-3-collapsed`);
    const mColl = await islandMetrics(page);
    console.log(`[${label}] COLLAPSED:`, JSON.stringify(mColl?.card), '| header:', JSON.stringify(mColl?.header));

    // Re-expand
    await page.click('button:has-text("Details")');
    await page.waitForTimeout(400);
    await shot(page, `${label}-4-reexp`);
    const mReExp = await islandMetrics(page);
    console.log(`[${label}] REEXP:`, JSON.stringify(mReExp?.card));

    await page.close();

    const d1 = mExp && mColl ? Math.abs(mExp.card.bottom - mColl.card.bottom) : 999;
    const d2 = mExp && mReExp ? Math.abs(mExp.card.bottom - mReExp.card.bottom) : 999;
    return {
      anchorFixed: d1 <= 2 && d2 <= 2,
      growsUp: mExp && mColl ? mColl.card.top > mExp.card.top : false,
      noPagePush: Math.abs(scrollAfter - scrollBefore) <= 5,
      headerVisible: mExp?.header?.inViewport !== false && mColl?.header?.inViewport !== false,
      d1, d2, scrollDelta: scrollAfter - scrollBefore,
    };
  };

  const desk = await runTest('desk', 1280, 800);
  const mob  = await runTest('mob', 390, 844);
  await browser.close();

  console.log('\n╔═══════════════════════╗');
  for (const [n, d] of [['DESKTOP', desk], ['MOBILE', mob]]) {
    console.log(`║ ${n}`);
    console.log(`║  1. Anchor fixed:   ${d.anchorFixed ? '✅' : '❌'}  Δ${d.d1} / Δ${d.d2}px`);
    console.log(`║  2. Grows upward:   ${d.growsUp ? '✅' : '❌'}`);
    console.log(`║  3. No page push:   ${d.noPagePush ? '✅' : '❌'}  scrollHΔ${d.scrollDelta}`);
    console.log(`║  5. Header visible: ${d.headerVisible ? '✅' : '❌'}`);
  }
  const all = ['anchorFixed','growsUp','noPagePush','headerVisible'].every(k => desk[k] && mob[k]);
  console.log(`╠═══════════════════════╣`);
  console.log(`║ OVERALL: ${all ? '✅ PASS' : '❌ FAIL'}`);
  console.log('╚═══════════════════════╝');
})();
