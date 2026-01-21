# Browser Automation Server

Cloud browser server with full mirroring and interaction support using Playwright and Socket.IO.

## Features

- Multiple browser instances with access codes
- Real-time screenshot streaming via CDP (Chrome DevTools Protocol)
- WebRTC DataChannels for efficient binary transfer
- Cookie import/management
- Multi-client support (multiple users can view the same browser)
- Tab management (open, switch, close)

## Quick Start

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install chromium
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Start server:
```bash
npm run dev
```

Server will run on `http://localhost:3000`

### Production (EC2)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed EC2 deployment instructions.

Quick setup:
```bash
# On EC2 instance
bash ec2-setup.sh
# Then follow the steps in DEPLOYMENT.md
```

## Environment Variables

- `PORT` - Server port (default: 3000)
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins (default: "*")

Example:
```bash
PORT=3000
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

## Browser Codes

Currently using a mock list. In production, fetch from database.

Default browser codes:
- ABC123 (Browser 1)
- XYZ789 (Browser 2)
- DEF456 (Browser 3)
- GHI012 (Browser 4)
- JKL345 (Browser 5)

## API/Socket Events

### Client → Server

- `connect_browser` - Authenticate with browser code
- `open_tab` - Open a new tab
- `switch_tab` - Switch to a different tab
- `close_tab` - Close a tab
- `list_tabs` - Get list of all tabs
- `navigate` - Navigate to URL
- `mouse_click` - Mouse click event
- `mouse_move` - Mouse move event
- `keyboard_input` - Keyboard input
- `scroll` - Scroll event
- `set_cookies` - Import cookies (JSON array)
- `webrtc_answer` - WebRTC answer
- `webrtc_ice_candidate` - WebRTC ICE candidate

### Server → Client

- `browser_connected` - Browser authentication success
- `browser_auth_error` - Browser authentication error
- `tab_opened` - New tab opened
- `tab_closed` - Tab closed
- `tab_switched` - Tab switched
- `tabs_list` - List of tabs
- `url_changed` - URL changed
- `screenshot` - Screenshot data (base64)
- `screenshot_binary` - Screenshot data (binary)
- `webrtc_offer` - WebRTC offer
- `webrtc_ice_candidate` - WebRTC ICE candidate
- `cookies_set` - Cookie import result

## Process Management

For production, use PM2:

```bash
# Install PM2
npm install -g pm2

# Start server
pm2 start index.js --name browser-automation

# Save configuration
pm2 save

# Setup auto-start on boot
pm2 startup
```

## Requirements

- Node.js 18+ (20+ recommended)
- Playwright Chromium browser
- System dependencies (see DEPLOYMENT.md)

## Security Notes

- Restrict `ALLOWED_ORIGINS` in production
- Use HTTPS with reverse proxy (Nginx)
- Keep system and dependencies updated
- Monitor resource usage (browsers are memory-intensive)
