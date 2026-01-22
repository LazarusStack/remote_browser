# TURN Server Firewall Fix Applied

## ✅ Issues Fixed

1. **UFW Firewall**: Added rules to allow port 3478 (UDP and TCP)
2. **TURN Server Binding**: Removed IP restriction to allow listening on all interfaces

## 🔧 Changes Made

### 1. UFW Firewall Rules Added
```bash
sudo ufw allow 3478/udp
sudo ufw allow 3478/tcp
```

### 2. TURN Server Configuration Updated
- Removed `listening-ip=172.31.40.24` restriction
- Now listens on all interfaces (0.0.0.0)

## 🧪 Testing

### From Your Local Machine

Try connecting again:
```bash
curl -v telnet://13.126.43.172:3478
```

Or test with netcat:
```bash
nc -zv 13.126.43.172 3478
```

### Expected Result

**✅ Success:**
```
Connection to 13.126.43.172 3478 port [tcp/*] succeeded!
```

**❌ Still Failing:**
- Wait 1-2 minutes for AWS security group rules to propagate
- Check if your local firewall/network allows outbound connections
- Verify security group rules are saved in AWS Console

## 📊 Current Status

- ✅ UFW firewall: Port 3478 allowed
- ✅ TURN server: Listening on all interfaces
- ✅ Security group: Port 3478 open (from earlier)
- ✅ coturn: Running and restarted

## 🎯 Next Steps

1. **Test connection from your local machine** (the curl command you ran)
2. **If connection succeeds**, test WebRTC again
3. **Check for relay candidates** in WebRTC logs

## 🔍 If Still Not Working

If the connection still times out:

1. **Wait 1-2 minutes** - AWS security group changes can take time to propagate
2. **Verify security group in AWS Console** - Make sure rules are saved
3. **Check your local network** - Some networks block outbound connections
4. **Test from a different network** - Try from mobile hotspot or different location

The TURN server should now be accessible! 🚀
