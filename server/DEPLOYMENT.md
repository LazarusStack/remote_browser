# EC2 Deployment Guide

This guide will help you deploy the browser automation server to AWS EC2.

## Prerequisites

- AWS EC2 instance (Ubuntu 20.04 or 22.04 recommended)
- SSH access to your EC2 instance
- Domain name (optional, for production)

## Step 1: Launch EC2 Instance

1. Go to AWS Console → EC2 → Launch Instance
2. Choose Ubuntu Server 22.04 LTS
3. Select instance type (t3.medium or larger recommended for browser automation)
4. Configure security group:
   - **Inbound Rules:**
     - SSH (22) - from your IP
     - Custom TCP (3000) - from anywhere (0.0.0.0/0) or your IP only
     - HTTP (80) - if using reverse proxy
     - HTTPS (443) - if using reverse proxy
5. Launch and save your key pair

## Step 2: Connect to EC2 Instance

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

## Step 3: Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Playwright dependencies
# Note: Ubuntu 24.04+ uses t64 suffix for some packages
# The ec2-setup.sh script handles this automatically

# For Ubuntu 24.04+:
sudo apt install -y \
  libnss3 \
  libnspr4 \
  libatk1.0-0t64 \
  libatk-bridge2.0-0t64 \
  libcups2t64 \
  libdrm2 \
  libdbus-1-3 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2t64 \
  libpango-1.0-0 \
  libcairo2

# For Ubuntu 20.04/22.04 (without t64 suffix):
# Replace t64 packages with: libatk1.0-0 libatk-bridge2.0-0 libcups2 libasound2

# Alternative: Let Playwright install dependencies automatically (recommended)
# This will be done after npm install: npx playwright install-deps chromium

# Install PM2 for process management
sudo npm install -g pm2

# Install Git (if not already installed)
sudo apt install -y git
```

## Step 4: Clone and Setup Project

```bash
# Clone your repository
git clone <your-repo-url>
cd browser_automation/server

# Install Node.js dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
npx playwright install-deps chromium

# Create .env file
cp .env.example .env
nano .env  # Edit with your configuration
```

## Step 5: Configure Environment Variables

Edit `.env` file:

```bash
PORT=3000
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

For development/testing, you can use:
```bash
PORT=3000
ALLOWED_ORIGINS=*
```

## Step 6: Start Server with PM2

```bash
# Start the server
pm2 start index.js --name browser-automation

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
# Follow the instructions it provides
```

## Step 7: Configure Firewall (UFW)

```bash
# Allow SSH
sudo ufw allow 22

# Allow your application port
sudo ufw allow 3000

# Enable firewall
sudo ufw enable
```

## Step 8: Setup Reverse Proxy (Optional but Recommended)

### Install Nginx

```bash
sudo apt install -y nginx
```

### Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/browser-automation
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/browser-automation /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Step 9: Setup SSL with Let's Encrypt (Optional)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is set up automatically
```

## Step 10: Update Frontend Configuration

Update your frontend to connect to the EC2 server:

1. Create `.env` file in `cloud-browser-ui/`:
```bash
VITE_SERVER_URL=http://your-ec2-ip:3000
# Or if using domain:
VITE_SERVER_URL=https://your-domain.com
```

2. Update `main.jsx` to use environment variable (see next section)

## Monitoring and Maintenance

### View PM2 logs
```bash
pm2 logs browser-automation
```

### Restart server
```bash
pm2 restart browser-automation
```

### Stop server
```bash
pm2 stop browser-automation
```

### View server status
```bash
pm2 status
```

### Monitor resources
```bash
pm2 monit
```

## Troubleshooting

### Check if server is running
```bash
pm2 status
netstat -tulpn | grep 3000
```

### Check logs
```bash
pm2 logs browser-automation --lines 100
```

### Check Playwright installation
```bash
npx playwright --version
```

### Test server locally on EC2
```bash
curl http://localhost:3000
```

## Security Considerations

1. **Firewall**: Only open necessary ports
2. **SSL**: Use HTTPS in production
3. **CORS**: Restrict ALLOWED_ORIGINS to your frontend domain
4. **SSH**: Use key-based authentication, disable password login
5. **Updates**: Keep system and dependencies updated
6. **Monitoring**: Set up CloudWatch or similar monitoring

## Cost Optimization

- Use EC2 Spot Instances for development
- Consider using t3.small for light usage
- Set up auto-scaling if needed
- Monitor CloudWatch for resource usage
