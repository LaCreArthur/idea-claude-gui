#!/bin/bash
# Run all tests across all components
# Usage: ./scripts/test-all.sh

set -e

echo "========================================="
echo "Running all tests..."
echo "========================================="

cd "$(dirname "$0")/.."

echo ""
echo "[1/3] Webview Tests (React/TypeScript)"
echo "-----------------------------------------"
npm test --prefix webview

echo ""
echo "[2/3] AI Bridge Tests (Node.js)"
echo "-----------------------------------------"
npm test --prefix ai-bridge

echo ""
echo "[3/3] Java Tests (IntelliJ Plugin)"
echo "-----------------------------------------"
./gradlew test --quiet

echo ""
echo "========================================="
echo "All tests passed!"
echo "========================================="
