#!/bin/sh
set -eu
umask 077

if [ "$(id -un)" != "julienlenaz" ]; then
  echo "This wallet must be initialized only in the julienlenaz macOS user." >&2
  exit 1
fi

cd /Volumes/good/Cruushv2-crypto-release/tools/cruush-wallet
exec npm run wallet -- init --acknowledge-software-wallet-risk
