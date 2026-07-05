const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });

  const shot = async (page, label) => {
    await page.screenshot({ path: `/tmp/island-${label}.png` });
  };

  // Capture full diagnostics: leftColumn, contentScroll, wrapper
  const snap = (page) => page.evaluate(() => {
    const el = (sel) => document.querySelector(sel);
    const rect = (sel) => {
      const e = el(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return {
        top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height),
        scrollH: e.scrollHeight, paddingBottom: cs.paddingBottom,
        position: cs.position, minHeight: cs.minHeight,
      };
    };
    return {
      scrollY: window.scrollY,
      docH: document.documentElement.scrollHeight,
      lc: rect('[data-left-column]'),
      cs: rect('[data-content-scroll]'),
      wr: rect('[data-island-wrapper]'),
    };
  });

  const fmt = (s) => {
    if (!s) return 'null';
    const f = (o) => o ? `${o.top}→${o.bottom}(h${o.height})` : '?';
    return `scrollY=${s.scrollY} docH=${s.docH} | lc:${f(s.lc)} | cs:${f(s.cs)} pb=${s.cs?.paddingBottom} | wr:${f(s.wr)} minH=${s.wr?.minHeight}`;
  };

  const runTest = async (label, width, height) => {
    const page = await browser.newPage();
    await page.setViewportSize({ width, height });
    await page.goto(process.argv[2] || 'http://localhost:3001', { waitUntil: 'networkidle' });

    await page.click('button:has-text("Ersten Fall lösen")');
    await page.waitForSelector('text=Fall starten', { timeout: 8000 });
    await page.locator('button:has-text("Klinik")').first().click();
    await page.waitForSelector('button:has-text("Fall starten →"):not([disabled])', { timeout: 5000 });
    await page.click('button:has-text("Fall starten →")');
    await page.waitForSelector('text=DIAGNOSE STELLEN', { timeout: 45000 });
    await page.waitForTimeout(300);

    // ① Before answering — DiagnosisIsland in wrapper
    const s1 = await snap(page);
    await shot(page, `${label}-1-before`);
    console.log(`[${label}] ① BEFORE:    ${fmt(s1)}`);

    // Submit
    const btnText = await page.locator('.grid-cols-2 button').first().textContent();
    await page.locator('.grid-cols-2 button').first().click({ force: true });
    console.log(`[${label}] Submitted: "${btnText?.trim().slice(0, 50)}"`);
    await page.waitForFunction(
      () => document.body.textContent.includes('Richtig erkannt') || document.body.textContent.includes('Leider falsch'),
      { timeout: 20000 }
    );
    await page.waitForTimeout(1000);

    // ② ResultIsland expanded (default: expanded=true)
    const s2 = await snap(page);
    await shot(page, `${label}-2-expanded`);
    console.log(`[${label}] ② EXPANDED:  ${fmt(s2)}`);

    // ③ Collapse details
    await page.locator('[data-island-wrapper] button:has-text("Details")').first().click({ force: true });
    await page.waitForTimeout(600);
    const s3 = await snap(page);
    await shot(page, `${label}-3-collapsed`);
    console.log(`[${label}] ③ COLLAPSED: ${fmt(s3)}`);

    // ④ Re-expand details
    await page.locator('[data-island-wrapper] button:has-text("Details")').first().click({ force: true });
    await page.waitForTimeout(600);
    const s4 = await snap(page);
    await shot(page, `${label}-4-reexpanded`);
    console.log(`[${label}] ④ REEXPAND:  ${fmt(s4)}`);

    await page.close();

    const before    = s1?.wr?.bottom ?? null;
    const expanded  = s2?.wr?.bottom ?? null;
    const collapsed = s3?.wr?.bottom ?? null;
    const reexp     = s4?.wr?.bottom ?? null;

    const d1 = before != null && expanded  != null ? Math.abs(before - expanded)  : 999;
    const d2 = before != null && collapsed != null ? Math.abs(before - collapsed) : 999;
    const d3 = before != null && reexp     != null ? Math.abs(before - reexp)     : 999;
    // Internal consistency: ②③④ all equal (anchor stable after collapse/reexpand)
    const d23 = expanded  != null && collapsed != null ? Math.abs(expanded - collapsed) : 999;
    const d24 = expanded  != null && reexp     != null ? Math.abs(expanded - reexp)     : 999;
    const anchorFixed = d1 <= 2 && d2 <= 2 && d3 <= 2;
    const internallyStable = d23 <= 2 && d24 <= 2;

    return { before, expanded, collapsed, reexp, d1, d2, d3, d23, d24, anchorFixed, internallyStable };
  };

  const desk = await runTest('desk', 1280, 800);
  const mob  = await runTest('mob',  390,  844);
  await browser.close();

  console.log('\n╔══════════════════════════════════════╗');
  for (const [n, d] of [['DESKTOP', desk], ['MOBILE', mob]]) {
    console.log(`║ ${n}`);
    console.log(`║  ① BEFORE:   ${d.before}`);
    console.log(`║  ② EXPANDED: ${d.expanded}`);
    console.log(`║  ③ COLLAPSED: ${d.collapsed}`);
    console.log(`║  ④ RE-EXPANDED: ${d.reexp}`);
    console.log(`║  Δ(before→expanded):  ${d.d1}px`);
    console.log(`║  Δ(before→collapsed): ${d.d2}px`);
    console.log(`║  Δ(before→reexp):     ${d.d3}px`);
    console.log(`║  Δ(②→③):   ${d.d23}px  Δ(②→④): ${d.d24}px`);
    console.log(`║  Anchor vs before: ${d.anchorFixed ? '✅' : '❌'}   Internal stability: ${d.internallyStable ? '✅' : '❌'}`);
  }
  const overallFixed = desk.anchorFixed && mob.anchorFixed;
  const overallStable = desk.internallyStable && mob.internallyStable;
  console.log(`╠══════════════════════════════════════╣`);
  console.log(`║ OVERALL ANCHOR: ${overallFixed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`║ OVERALL STABLE: ${overallStable ? '✅ PASS' : '❌ FAIL'}`);
  console.log('╚══════════════════════════════════════╝');
})();
