#!/usr/bin/env node
/**
 * E2E Test Runner
 *
 * Runs all validated E2E tests and reports results.
 *
 * Usage: node tests/e2e/run-all.mjs
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// List of validated tests to run (in order)
const TESTS = [
  'test-message-flow.mjs',        // US-1: Core message flow
  'test-session-management.mjs',  // US-2: Session management
  'test-session-resume.mjs',      // US-3: Resume existing session
  'test-model-selection.mjs',     // US-4: Model selection
  'test-mode-switching.mjs',      // US-6: Mode switching
  'test-permission-flow.mjs',     // US-5: Permission dialogs
  'test-plan-approval.mjs',       // US-7: Plan mode
  'test-error-handling.mjs',      // US-14: Error handling
];

async function runTest(testFile) {
  return new Promise((resolve) => {
    const testPath = join(__dirname, testFile);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${testFile}`);
    console.log('='.repeat(60));

    const proc = spawn('node', [testPath], {
      stdio: 'inherit',
      cwd: dirname(__dirname),
    });

    proc.on('close', (code) => {
      resolve({ test: testFile, passed: code === 0 });
    });

    proc.on('error', (err) => {
      console.error(`Error running ${testFile}:`, err.message);
      resolve({ test: testFile, passed: false });
    });
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Claude GUI E2E Test Suite                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Prerequisites:');
  console.log('  - Rider running with Claude GUI panel open');
  console.log('  - CDP port 9222 accessible');
  console.log('');

  // Quick CDP check
  try {
    const response = await fetch('http://localhost:9222/json/version');
    if (!response.ok) throw new Error('CDP not responding');
    console.log('✅ CDP connection verified\n');
  } catch (e) {
    console.error('❌ CDP not available at localhost:9222');
    console.error('   Open Claude GUI panel in Rider first.');
    process.exit(1);
  }

  const results = [];
  for (const test of TESTS) {
    const result = await runTest(test);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('                    TEST RESULTS');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.test}`);
  }

  console.log('');
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Runner error:', e);
  process.exit(1);
});
