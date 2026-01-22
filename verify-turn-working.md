# Verify TURN Server is Working

## ✅ Current Status

- ✅ Security Group: Port 3478 (UDP/TCP) is **OPEN**
- ✅ TURN Server: coturn is **RUNNING**
- ✅ Port 3478: **LISTENING**
- ✅ Configuration: Correct credentials and external IP

## 🧪 Next Steps to Test

### 1. Restart Your Application Server

The TURN server configuration is already in the code, but make sure your server has picked it up:

```bash
# If using PM2
pm2 restart browser-automation

# Or restart your Node.js server process
```

### 2. Test WebRTC Connection

1. Navigate to your WebRTC test page
2. Open browser developer console (F12)
3. Start a WebRTC test connection
4. Look for these logs:

**In Browser Console:**
```
[WebRTC Test] TURN server configured: turn:13.126.43.172:3478
```

**In Server Logs:**
```
[WebRTC] TURN server configured: turn:13.126.43.172:3478
[WebRTC Test] Local ICE candidate #X: { type: 'relay', ... }  ← This is what we want!
```

### 3. Check for Relay Candidates

After starting the test, look for:

**✅ SUCCESS - TURN Working:**
```
types: { host: X, srflx: 1, relay: 1+, prflx: 0 }
✅ ICE connection connected
```

**❌ FAILURE - TURN Not Working:**
```
types: { host: X, srflx: 1, relay: 0, prflx: 0 }
❌ ICE connection failed
```

### 4. Monitor TURN Server Activity

In a separate terminal, watch for TURN server activity:

```bash
# Watch coturn logs in real-time
sudo journalctl -u coturn -f
```

When a WebRTC connection is attempted, you should see:
- Connection attempts
- Authentication attempts
- Relay allocations

### 5. Test from External Client

If you have access from another machine, test TURN connectivity:

```bash
# From another machine (if you have turnutils installed)
turnutils_stunclient 13.126.43.172
```

## 🔍 Troubleshooting

### If Still No Relay Candidates

1. **Check TURN server is reachable:**
   ```bash
   # From EC2
   curl -v telnet://13.126.43.172:3478
   ```

2. **Verify credentials match:**
   - Server config: `user=turnuser:turnpassword`
   - Code config: `turnuser:turnpassword`
   - Must match exactly!

3. **Check firewall (UFW):**
   ```bash
   sudo ufw status
   # Should allow port 3478
   ```

4. **Check if client can reach TURN:**
   - Client must be able to connect to `13.126.43.172:3478`
   - If client is behind corporate firewall, it might block TURN

5. **Enable verbose logging in coturn:**
   ```bash
   sudo nano /etc/turnserver.conf
   # Make sure these are set:
   verbose
   no-stdout-log
   log-file=/var/log/turnserver.log
   ```
   Then restart: `sudo systemctl restart coturn`

6. **Check TURN server logs:**
   ```bash
   sudo tail -f /var/log/turnserver.log
   # Or if log file doesn't exist:
   sudo journalctl -u coturn -f
   ```

## 📊 Expected Behavior

Once TURN is working correctly:

1. **ICE Candidate Gathering:**
   - You'll see `type: 'relay'` candidates in logs
   - Multiple relay candidates (one per relay port)

2. **Connection Success:**
   - `types: { relay: 2+ }` in final diagnostics
   - `✅ ICE connection connected`
   - `✅ Connection established successfully`

3. **TURN Server Logs:**
   - Authentication success messages
   - Relay allocation messages
   - Client connection messages

## 🎯 Summary

**Status:** Port 3478 is now open! ✅

**Next:** 
1. Restart your application server
2. Test WebRTC connection
3. Check logs for relay candidates
4. If still no relay candidates, check TURN server logs for errors

The TURN server should now be able to accept connections and generate relay candidates! 🚀
