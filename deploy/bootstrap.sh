#!/usr/bin/env bash
# Provisions an Ubuntu 24.04 (x86_64) host to run the amenity booking scheduler.
# Runs as root via EC2 user-data on first boot. Idempotent enough to re-run by hand.
set -euxo pipefail

# --- Swap: t3a.nano has only 512MB RAM; Chromium needs headroom ---
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg xvfb

# --- Node.js 20 (LTS) from NodeSource ---
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# --- Runtime libraries for Puppeteer's bundled Chromium (Ubuntu 24.04 names) ---
apt-get install -y \
  libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2t64 libatspi2.0-0t64 libgtk-3-0t64 \
  fonts-liberation

# Marker so the deploy step knows provisioning finished.
touch /var/lib/amenity-bootstrap-done
echo "bootstrap complete"
