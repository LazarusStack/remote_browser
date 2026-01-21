# TURN Server Setup for Production

WebRTC connections often fail in production environments due to NAT/firewall restrictions. A TURN (Traversal Using Relays around NAT) server is required for reliable connections.

## Why TURN Server is Needed

- **STUN servers** can discover your public IP but cannot relay traffic
- **TURN servers** can relay traffic when direct connection fails
- Production environments (cloud servers, corporate networks) often have strict NAT/firewall rules
- Without TURN, connections will fail with `ICE connection state: failed`

## Environment Variables

Add these to your `.env` file or production environment:

```bash
TURN_URL=turn:your-turn-server.com:3478
TURN_USERNAME=your-username
TURN_CREDENTIAL=your-password
```

## Free TURN Server Options

### 1. Metered.ca (Recommended for Testing)
- **URL**: https://www.metered.ca/tools/openrelay/
- **Free Tier**: 1 GB/month
- **Setup**: 
  1. Sign up for free account
  2. Get credentials from dashboard
  3. Use format: `turn:openrelay.metered.ca:80` or `turn:openrelay.metered.ca:443`

### 2. Xirsys
- **URL**: https://xirsys.com/
- **Free Tier**: Limited
- **Setup**: Sign up and get credentials from dashboard

### 3. Twilio STUN/TURN
- **URL**: https://www.twilio.com/stun-turn
- **Free Tier**: Limited
- **Setup**: Sign up for Twilio account

## Self-Hosted TURN Server

For production, consider self-hosting using [coturn](https://github.com/coturn/coturn):

```bash
# Install coturn
sudo apt-get install coturn

# Configure /etc/turnserver.conf
listening-port=3478
realm=yourdomain.com
server-name=yourdomain.com
user=username:password
```

## Testing TURN Server

After configuring, test the connection:
1. Start the server with TURN credentials
2. Navigate to `/webrtc-test` route
3. Check logs for:
   - `[WebRTC] TURN server configured: turn:...`
   - `types: { relay: X }` where X > 0 (indicates relay candidates)
4. Connection should succeed

## Current Status

If you see in logs:
- `No TURN server configured` → Add TURN server credentials
- `types: { relay: 0 }` → TURN server not working or not configured
- `types: { relay: 1+ }` → TURN server working correctly

## Troubleshooting

### Connection Still Fails with TURN
1. Verify TURN server is accessible from your server
2. Check credentials are correct
3. Test TURN server connectivity:
   ```bash
   # Test TURN server
   turnutils_stunclient your-turn-server.com
   ```
4. Check firewall allows UDP traffic on TURN port (usually 3478)

### No Relay Candidates Generated
- TURN server URL format incorrect
- Credentials invalid
- TURN server unreachable from server
- Firewall blocking TURN server
