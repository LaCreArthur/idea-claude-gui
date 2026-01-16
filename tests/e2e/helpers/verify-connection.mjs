/**
 * Verify CDP connection to Claude GUI webview
 */

import { getPage, closeConnection, isTestMode } from './webview.mjs';

async function verify() {
  console.log('Verifying CDP connection...\n');

  try {
    const { page } = await getPage();
    const title = await page.title();
    console.log('✓ Connected to webview');
    console.log(`  Title: ${title}`);

    const testMode = await isTestMode();
    console.log(`  Test mode: ${testMode ? 'enabled' : 'disabled'}`);

    console.log('\n✓ Connection verified successfully');
  } catch (error) {
    console.error('✗ Connection failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Is Rider running?');
    console.log('2. Is Claude GUI panel open?');
    console.log('3. Is CDP port 9222 enabled in Rider registry?');
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

verify();
