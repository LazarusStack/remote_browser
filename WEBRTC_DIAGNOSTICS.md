# WebRTC Connection Diagnostics Guide

This guide explains how to diagnose WebRTC connection issues by checking logs and understanding what they mean.

## What to Look For in Logs

### 1. ICE Candidate Exchange

**Server Logs:**
- `[WebRTC] ICE candidate generated` - Server generated a candidate
- `[WebRTC] ICE candidate received from client` - Client sent a candidate
- `[WebRTC] ICE candidate added successfully` - Candidate was processed

**Client Logs:**
- `[WebRTC Client] ICE candidate generated` - Client generated a candidate
- `[WebRTC Client] ICE candidate received from server` - Server sent a candidate
- `[WebRTC Client] ICE candidate added successfully` - Candidate was processed

**What to Check:**
- ✅ **Good**: You see candidates being generated and received on both sides
- ❌ **Problem**: No candidates generated or received
  - **Cause**: STUN server unreachable, network blocking UDP
  - **Solution**: Check firewall, try different STUN server, or add TURN server

### 2. ICE Connection State

**Possible States:**
- `new` - Initial state
- `checking` - Checking connectivity
- `connected` - ✅ Connection established
- `completed` - ✅ All checks done, connection ready
- `failed` - ❌ Connection failed
- `disconnected` - Temporarily disconnected
- `closed` - Connection closed

**What to Check:**
- ✅ **Good**: State progresses: `new` → `checking` → `connected` → `completed`
- ❌ **Problem**: State goes to `failed`
  - **Causes**:
    - No ICE candidates exchanged
    - Firewall/NAT blocking UDP traffic
    - STUN server unreachable
    - Network issues

### 3. ICE Gathering State

**Possible States:**
- `new` - Not gathering yet
- `gathering` - Actively gathering candidates
- `complete` - Gathering finished

**What to Check:**
- ✅ **Good**: State goes from `new` → `gathering` → `complete`
- ❌ **Problem**: Stuck in `gathering` or never starts
  - **Cause**: STUN server not responding
  - **Solution**: Check STUN server connectivity

### 4. Connection State

**Possible States:**
- `new` - Initial state
- `connecting` - Establishing connection
- `connected` - ✅ Connected
- `disconnected` - Temporarily disconnected
- `failed` - ❌ Connection failed
- `closed` - Connection closed

**What to Check:**
- ✅ **Good**: `new` → `connecting` → `connected`
- ❌ **Problem**: Goes to `failed` or `closed`
  - Check ICE connection state for more details

## Common Issues and Solutions

### Issue 1: No ICE Candidates Generated

**Symptoms:**
- No `ICE candidate generated` logs
- ICE gathering state stuck at `new` or `gathering`

**Possible Causes:**
1. **STUN server unreachable**
   - Check: Can you reach `stun:stun.l.google.com:19302`?
   - Solution: Try different STUN server or add TURN server

2. **Firewall blocking UDP**
   - Check: Network/firewall settings
   - Solution: Allow UDP traffic on required ports

3. **Network restrictions**
   - Check: Corporate network, VPN, or ISP restrictions
   - Solution: Use TURN server for relay

### Issue 2: ICE Candidates Generated But Not Received

**Symptoms:**
- Server generates candidates but client doesn't receive them (or vice versa)
- `ICE candidate generated` but no `ICE candidate received` on other side

**Possible Causes:**
1. **Socket.IO connection issue**
   - Check: Socket connection logs
   - Solution: Verify socket connection is stable

2. **Message not being sent**
   - Check: Socket emit errors in console
   - Solution: Verify socket.emit is working

### Issue 3: ICE Connection Fails

**Symptoms:**
- `ICE connection state: failed`
- Connection state goes to `failed`

**Possible Causes:**
1. **No matching candidates**
   - Both sides generate candidates but none match
   - **Solution**: Add TURN server for relay

2. **NAT traversal failure**
   - Complex NAT/firewall preventing direct connection
   - **Solution**: Use TURN server

3. **STUN server issues**
   - STUN server not providing correct public IP
   - **Solution**: Try different STUN servers

### Issue 4: Connection Stuck in "Connecting"

**Symptoms:**
- Connection state stays at `connecting`
- ICE state stays at `checking`

**Possible Causes:**
1. **ICE candidates still being exchanged**
   - Wait a bit longer (can take 10-30 seconds)

2. **Network delay**
   - Slow network connection
   - **Solution**: Wait longer or check network speed

3. **Partial connectivity**
   - Some candidates work but connection not fully established
   - **Solution**: Add TURN server

## Diagnostic Checklist

When debugging WebRTC issues, check these in order:

1. **✅ Are offers/answers being exchanged?**
   - Look for: `Offer created and sent` / `Answer received`
   - If missing: Check socket connection

2. **✅ Are ICE candidates being generated?**
   - Look for: `ICE candidate generated` on both sides
   - If missing: STUN server issue

3. **✅ Are ICE candidates being received?**
   - Look for: `ICE candidate received` on both sides
   - If missing: Socket.IO communication issue

4. **✅ What is the ICE connection state?**
   - Look for: `ICE connection state changed`
   - If `failed`: Check network/firewall/TURN server

5. **✅ What is the connection state?**
   - Look for: `Connection state changed`
   - If `failed`: Check ICE connection state

## Adding TURN Server

If STUN alone doesn't work (common in corporate networks or complex NATs), add a TURN server:

```javascript
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { 
      urls: 'turn:your-turn-server.com:3478',
      username: 'your-username',
      credential: 'your-password'
    }
  ]
});
```

**Free TURN servers for testing:**
- https://www.metered.ca/tools/openrelay/ (free tier available)
- https://xirsys.com/ (free tier available)

## Testing STUN Server Connectivity

You can test if STUN server is reachable:

```bash
# Test Google STUN server
nc -u -v stun.l.google.com 19302
```

Or use online tools:
- https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
- Enter: `stun:stun.l.google.com:19302`

## Log Interpretation Examples

### ✅ Successful Connection Flow

```
[WebRTC] Offer created and sent
[WebRTC Client] Processing offer
[WebRTC Client] Sending answer
[WebRTC] Answer received and set
[WebRTC] ICE candidate generated
[WebRTC Client] ICE candidate generated
[WebRTC] ICE candidate received from client
[WebRTC Client] ICE candidate received from server
[WebRTC] ICE connection state: checking
[WebRTC Client] ICE connection state: checking
[WebRTC] ICE connection state: connected
[WebRTC Client] ICE connection state: connected
[WebRTC] Connection state: connected
[WebRTC Client] Connection state: connected
[WebRTC] DataChannel opened
```

### ❌ Failed Connection Flow

```
[WebRTC] Offer created and sent
[WebRTC Client] Processing offer
[WebRTC Client] Sending answer
[WebRTC] Answer received and set
[WebRTC] ICE candidate generated
[WebRTC Client] ICE candidate generated
[WebRTC] ICE connection state: checking
[WebRTC Client] ICE connection state: checking
[WebRTC] ICE connection state: failed  ← PROBLEM
[WebRTC Client] ICE connection state: failed  ← PROBLEM
[WebRTC] Connection state: failed
```

**Diagnosis**: ICE candidates generated but connection failed - likely NAT/firewall issue, need TURN server.
