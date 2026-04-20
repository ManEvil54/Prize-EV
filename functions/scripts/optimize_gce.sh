#!/bin/bash

# Optimization script for Prize EV Bot Redis Hub
# Recommended for single-server GCE VM setups

echo "🚀 Starting GCE Optimization for Redis..."

# 1. Disable Transparent Huge Pages (THP)
# Why: THP can cause high memory usage and latency spikes with Redis background saving.
echo "Disabling Transparent Huge Pages..."
if [ -f /sys/kernel/mm/transparent_hugepage/enabled ]; then
    sudo sh -c 'echo never > /sys/kernel/mm/transparent_hugepage/enabled'
    sudo sh -c 'echo never > /sys/kernel/mm/transparent_hugepage/defrag'
    echo "✅ THP set to 'never'."
else
    echo "⚠️  THP configuration file not found. Skipping."
fi

# 2. Overcommit Memory
# Why: Redis background saving (RDB) needs this to ensure it doesn't fail under memory pressure.
echo "Setting vm.overcommit_memory to 1..."
sudo sysctl vm.overcommit_memory=1
echo "✅ vm.overcommit_memory = 1"

# 3. Increase TCP Backlog
# Why: For high-concurrency bot connections.
echo "Increasing TCP backlog to 65535..."
sudo sysctl -w net.core.somaxconn=65535
echo "✅ net.core.somaxconn = 65535"

# 4. Persistence for THP (Optional: Add to /etc/rc.local if desired)
echo "------------------------------------------------------------"
echo "NOTE: To make THP changes permanent across reboots, add the"
echo "commands to your /etc/rc.local or a systemd service."
echo "------------------------------------------------------------"

echo "✅ GCE Optimization Complete."
