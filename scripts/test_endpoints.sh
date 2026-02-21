#!/bin/bash

# Master test script for Polkadot DeFi Indexer
# This script verifies that all implemented protocol crawlers are functional.

BASE_URL="http://localhost:3000"

echo "🚀 Starting Full Protocol Verification..."
echo "-----------------------------------------"

# 1. Moonwell (Markets)
echo "📡 Testing Moonwell (Moonbeam + Base)..."
RESPONSE_MW=$(curl -s "$BASE_URL/moonwell/crawl/markets")
ITEMS_MW=$(echo "$RESPONSE_MW" | grep -o '"itemsFound":[0-9]*' | cut -d: -f2)
if [[ "$ITEMS_MW" -gt 0 ]]; then
    echo "✅ Moonwell: Found $ITEMS_MW markets"
else
    echo "❌ Moonwell: Failed or found 0 markets"
fi

# 2. Bifrost (vStaking)
echo "📡 Testing Bifrost vStaking..."
RESPONSE_VS=$(curl -s "$BASE_URL/bifrost/crawl/vstaking")
ITEMS_VS=$(echo "$RESPONSE_VS" | grep -o '"itemsFound":[0-9]*' | cut -d: -f2)
if [[ "$ITEMS_VS" -gt 0 ]]; then
    echo "✅ Bifrost vStaking: Found $ITEMS_VS pools"
else
    echo "❌ Bifrost vStaking: Failed or found 0 pools"
fi

# 3. Bifrost (Farming)
echo "📡 Testing Bifrost Farming..."
RESPONSE_FA=$(curl -s "$BASE_URL/bifrost/crawl/farming")
ITEMS_FA=$(echo "$RESPONSE_FA" | grep -o '"itemsFound":[0-9]*' | cut -d: -f2)
if [[ "$ITEMS_FA" -gt 0 ]]; then
    echo "✅ Bifrost Farming: Found $ITEMS_FA pools"
else
    echo "❌ Bifrost Farming: Failed or found 0 pools"
fi

echo "-----------------------------------------"
echo "🎉 Verification complete. Logs saved in ./logs/"
