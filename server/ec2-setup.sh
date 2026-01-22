#!/bin/bash
# EC2 Setup Script for Browser Automation Server
# Run this script on a fresh Ubuntu EC2 instance

set -e

echo "🚀 Starting EC2 setup for Browser Automation Server..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
node --version
npm --version

# Install Playwright system dependencies
echo "📦 Installing Playwright system dependencies..."
# Ubuntu 24.04+ uses t64 suffix for some packages
# We'll install the correct versions based on what's available

# Base packages (same across versions)
sudo apt install -y \
  libnss3 \
  libnspr4 \
  libdrm2 \
  libdbus-1-3 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2

# Packages that may have t64 suffix in Ubuntu 24.04+
# Try modern names first, fallback to old names
if sudo apt install -y libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libasound2t64 2>/dev/null; then
  echo "✓ Installed packages with t64 suffix (Ubuntu 24.04+)"
else
  # Fallback for older Ubuntu versions
  sudo apt install -y libatk1.0-0 libatk-bridge2.0-0 libcups2 libasound2 || {
    echo "⚠ Some packages may need manual installation"
    echo "  You can run 'npx playwright install-deps chromium' after npm install"
  }
fi

echo "✅ Playwright system dependencies installation attempted"
echo "   Note: Run 'npx playwright install-deps chromium' after npm install for complete setup"

# Install PM2 globally
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install Git if not present
if ! command -v git &> /dev/null; then
  echo "📦 Installing Git..."
  sudo apt install -y git
fi

# Setup firewall
echo "🔥 Configuring firewall..."
sudo ufw allow 22/tcp
sudo ufw allow 3000/tcp
# Note: WebRTC uses STUN servers (outbound UDP to port 19302) and dynamic UDP ports for peer connections
# Outbound UDP is typically allowed by default
# For inbound WebRTC connections, ensure AWS Security Group allows UDP traffic (ports 10000-20000 recommended)
sudo ufw --force enable

echo "⚠️  IMPORTANT: Configure AWS Security Group to allow:"
echo "   - Inbound UDP: ports 10000-20000 (for WebRTC peer connections)"
echo "   - Outbound UDP: port 19302 (for STUN server access)"

echo "✅ System setup complete!"
echo ""
echo "Next steps:"
echo "1. Clone your repository: git clone <your-repo-url>"
echo "2. cd browser_automation/server"
echo "3. npm install"
echo "4. npx playwright install chromium"
echo "5. npx playwright install-deps chromium"
echo "6. cp .env.example .env"
echo "7. Edit .env with your configuration"
echo "8. pm2 start index.js --name browser-automation"
echo "9. pm2 save"
echo "10. pm2 startup (follow instructions)"
