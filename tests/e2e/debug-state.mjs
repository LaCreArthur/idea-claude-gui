#!/usr/bin/env node
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');

for (const ctx of browser.contexts()) {
  for (const page of ctx.pages()) {
    const title = await page.title();
    if (!title.includes('Claude')) continue;

    // Check for selector buttons (mode and model)
    const buttons = await page.evaluate(() => {
      const btns = document.querySelectorAll('.selector-button, button');
      return Array.from(btns).map(b => ({
        text: b.textContent?.trim()?.substring(0, 50),
        className: b.className
      })).filter(b => b.text);
    });

    console.log('Selector buttons found:');
    buttons.forEach(b => console.log(`  - "${b.text}" | ${b.className}`));

    const state = await page.evaluate(() => {
      return {
        hasPermissionDialog: !!document.querySelector('.permission-dialog-v3'),
        hasAskUserDialog: !!document.querySelector('.ask-user-question-dialog'),
        isGenerating: document.body.innerText?.includes('Generating'),
        messageCount: document.querySelectorAll('.message').length,
      };
    });

    console.log('\nCurrent State:');
    console.log(JSON.stringify(state, null, 2));
  }
}

await browser.close();
