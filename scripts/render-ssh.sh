#!/usr/bin/env bash
# Quick SSH connection to Render backend service
# Usage: ./scripts/render-ssh.sh

echo "🔌 Connecting to Render backend service..."
echo ""
echo "You can also use:"
echo "  ssh render-finsight"
echo "  render ssh srv-d21imrnfte5s73flfq00"
echo ""

# Use Render CLI for better integration
if command -v render &>/dev/null; then
    render ssh srv-d21imrnfte5s73flfq00
else
    ssh render-finsight
fi

