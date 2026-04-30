#!/usr/bin/env bash
# Idempotent setup for Oracle Cloud / 1GB RAM systems.
# Run once on the VM as a sudo-capable user, then re-run safely after upgrades.

set -euo pipefail

echo "==> Checking swap..."
if ! swapon --show | grep -q "/swapfile"; then
  echo "    Creating 4GB swapfile..."
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  if ! grep -q "/swapfile" /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  fi
else
  echo "    Swap already active."
fi

echo "==> Tuning kernel for low memory..."
sudo sysctl -w vm.swappiness=10
sudo sysctl -w vm.vfs_cache_pressure=50
sudo sysctl -w vm.overcommit_memory=1

# Persist
{
  echo "vm.swappiness=10"
  echo "vm.vfs_cache_pressure=50"
  echo "vm.overcommit_memory=1"
} | sudo tee /etc/sysctl.d/99-langgraph-lowmem.conf >/dev/null
sudo sysctl --system >/dev/null

echo "==> Current memory state:"
free -h
echo ""
echo "==> Done. You can now run: pm2 start ecosystem.config.js"
