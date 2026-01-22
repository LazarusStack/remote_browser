# EC2 TURN Server Setup Complete

## ✅ TURN Server Configuration

Your EC2 instance now has a fully configured TURN server using **coturn**.

### Current Configuration

- **TURN Server**: Running on port `3478` (UDP/TCP)
- **Public IP**: `13.126.43.172`
- **Relay Port Range**: `49160-49200` (UDP)
- **Credentials**:
  - Username: `turnuser`
  - Password: `turnpassword`
  - Realm: `ec2-turn`

### TURN Server Status

```bash
# Check if coturn is running
sudo systemctl status coturn

# View TURN server logs
sudo tail -f /var/log/turnserver.log

# Restart TURN server if needed
sudo systemctl restart coturn
```

## ✅ Code Updates

All WebRTC code has been updated to use the local TURN server:

1. **Backend** (`server/handlers/webrtcHandlers.js`):
   - `getIceServers()` now includes TURN server
   - Defaults to `turn:13.126.43.172:3478`

2. **Backend** (`server/webrtc/webrtcManager.js`):
   - Uses `getIceServers()` function with TURN support

3. **Frontend** (`cloud-browser-ui/src/socket-component/hooks/useWebRTC.js`):
   - Uses TURN server from environment variables or defaults
   - Supports `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`

4. **Frontend Test** (`cloud-browser-ui/src/webrtc-test/WebRTCTest.jsx`):
   - Updated to use TURN server

## 🔧 Environment Variables (Optional)

You can override the default TURN server settings using environment variables:

### Backend (.env)
```bash
TURN_URL=turn:13.126.43.172:3478
TURN_USERNAME=turnuser
TURN_CREDENTIAL=turnpassword
```

### Frontend (.env in cloud-browser-ui/)
```bash
VITE_TURN_URL=turn:13.126.43.172:3478
VITE_TURN_USERNAME=turnuser
VITE_TURN_CREDENTIAL=turnpassword
```

**Note**: If not set, the code defaults to the EC2 TURN server automatically.

## 🔒 Security Group Configuration

Based on your security group image, you already have:
- ✅ **Inbound UDP 10000-20000**: Open (for WebRTC peer connections)
- ✅ **Inbound UDP 49160-49200**: Open (for TURN relay ports)
- ✅ **Outbound All**: Open (for STUN/TURN access)

**⚠️ IMPORTANT**: Make sure you also have:
- **Inbound UDP 3478**: Open (for TURN server listening port)
- **Inbound TCP 3478**: Open (for TURN server TCP connections)

If port 3478 is not open, add these rules to your security group:

### AWS Console
1. Go to EC2 → Security Groups
2. Select your security group (`launch-wizard-2`)
3. Edit Inbound Rules
4. Add rules:
   - **Type**: Custom UDP
   - **Port**: `3478`
   - **Source**: `0.0.0.0/0`
   - **Description**: "TURN server UDP"
   
   - **Type**: Custom TCP
   - **Port**: `3478`
   - **Source**: `0.0.0.0/0`
   - **Description**: "TURN server TCP"

### AWS CLI
```bash
# Get your security group ID
SG_ID=$(aws ec2 describe-instances \
  --instance-ids $(ec2-metadata --instance-id | cut -d " " -f 2) \
  --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' \
  --output text)

# Add UDP 3478
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --ip-permissions IpProtocol=udp,FromPort=3478,ToPort=3478,IpRanges=[{CidrIp=0.0.0.0/0,Description="TURN server UDP"}]

# Add TCP 3478
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --ip-permissions IpProtocol=tcp,FromPort=3478,ToPort=3478,IpRanges=[{CidrIp=0.0.0.0/0,Description="TURN server TCP"}]
```

## 🧪 Testing

### 1. Test TURN Server Connectivity

```bash
# Test from EC2 instance
turnutils_stunclient 13.126.43.172

# Or test from your local machine
turnutils_stunclient 13.126.43.172
```

### 2. Test WebRTC Connection

1. Start your server
2. Navigate to `/webrtc-test` route
3. Click "Start WebRTC Test"
4. Check browser console for:
   - `[WebRTC] TURN server configured: turn:13.126.43.172:3478`
   - `types: { relay: 1+ }` (indicates TURN is working)
   - `✅ ICE connection connected`

### 3. Check Logs

**Backend logs should show:**
```
[WebRTC] TURN server configured: turn:13.126.43.172:3478
[WebRTC] ICE candidate generated: ... typ relay ...
```

**Frontend console should show:**
```
[WebRTC Client] TURN server configured: turn:13.126.43.172:3478
[WebRTC Client] ICE candidate generated: ... typ relay ...
```

## 🔍 Troubleshooting

### TURN Server Not Working

1. **Check coturn is running:**
   ```bash
   sudo systemctl status coturn
   ```

2. **Check TURN server logs:**
   ```bash
   sudo tail -f /var/log/turnserver.log
   ```

3. **Verify port is listening:**
   ```bash
   sudo ss -tuln | grep 3478
   ```

4. **Test TURN server:**
   ```bash
   turnutils_stunclient 13.126.43.172
   ```

### No Relay Candidates

If you see `types: { relay: 0 }` in logs:

1. **Check security group** - port 3478 must be open
2. **Check TURN credentials** - must match coturn config
3. **Check TURN server URL** - must use correct IP/port
4. **Check firewall** - UFW should allow port 3478

### Connection Still Fails

Even with TURN configured, if connection fails:

1. **Check both sides have TURN configured** (server and client)
2. **Verify relay candidates are generated** (`relay: 1+`)
3. **Check network connectivity** - TURN server must be reachable
4. **Review WebRTC logs** for specific error messages

## 📝 Summary

✅ **TURN server installed and running** (coturn)
✅ **Backend code updated** to use TURN server
✅ **Frontend code updated** to use TURN server
✅ **Security group configured** (ports 10000-20000, 49160-49200)
⚠️ **Verify port 3478 is open** in security group

Your WebRTC connections should now work reliably even with strict NAT/firewall rules!
