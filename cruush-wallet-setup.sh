#!/bin/sh
set -e
cd /Volumes/good/Cruushv2-crypto-processor-20260822/tools/cruush-wallet
npm install --ignore-scripts --legacy-peer-deps
npm run wallet -- --help
