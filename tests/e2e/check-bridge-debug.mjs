/**
 * Check for bridge debug messages in the log
 */

import { chromium } from 'playwright';

async function checkBridgeDebug() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');

  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const title = await page.title();
      if (title.includes('Claude')) {
        console.log('Found Claude webview\n');

        const log = await page.evaluate(() => window.__testMessageLog || []);
        console.log(`Total log entries: ${log.length}\n`);

        // Look for Bridge messages
        const bridgeMessages = log.filter(entry =>
          entry.msg?.includes('Bridge') || entry.msg?.includes('permissionMode')
        );

        console.log(`Bridge-related messages (${bridgeMessages.length}):`);
        for (const entry of bridgeMessages) {
          console.log(`  [${entry.dir}] ${entry.msg}`);
        }

        // Show last 20 entries regardless
        console.log('\n\nLast 20 log entries:');
        for (const entry of log.slice(-20)) {
          console.log(`  [${entry.dir}] ${entry.msg?.substring(0, 150)}`);
        }

        break;
      }
    }
  }

  await browser.close();
}

checkBridgeDebug().catch(console.error);
