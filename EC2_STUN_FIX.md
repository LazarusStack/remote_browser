# EC2 STUN Connection Fix Guide

## Problem
Unable to connect EC2 instance with STUN servers for WebRTC connections.

## Root Cause
AWS Security Groups control network traffic to/from your EC2 instance. By default, they may not allow:
1. **Outbound UDP to port 19302** (required for STUN servers)
2. **Inbound UDP ports** (required for WebRTC peer connections)

## Solution: Configure AWS Security Group

### Step 1: Find Your Security Group

1. Go to [AWS Console](https://console.aws.amazon.com/ec2/)
2. Navigate to **EC2 → Instances**
3. Select your EC2 instance
4. Click on the **Security** tab
5. Note the **Security group** name (e.g., `sg-xxxxxxxxx`)

### Step 2: Add Outbound Rule for STUN

1. Click on the Security Group name to open it
2. Go to **Outbound rules** tab
3. Click **Edit outbound rules**
4. Click **Add rule**
5. Configure:
   - **Type**: Custom UDP
   - **Port range**: `19302`
   - **Destination**: `0.0.0.0/0` (or specific STUN server IPs if you prefer)
   - **Description**: "STUN server access"
6. Click **Save rules**

### Step 3: Add Inbound Rules for WebRTC

1. Go to **Inbound rules** tab
2. Click **Edit inbound rules**
3. Click **Add rule**
4. Configure for WebRTC peer connections:
   - **Type**: Custom UDP
   - **Port range**: `10000-20000` (recommended range for WebRTC)
   - **Source**: 
     - `0.0.0.0/0` (if you want to allow from anywhere)
     - OR specific IP ranges for better security
   - **Description**: "WebRTC peer connections"
5. Click **Save rules**

### Step 4: Verify Configuration

Your Security Group should now have:

**Outbound Rules:**
- ✅ All traffic (default) OR at minimum:
  - TCP port 443 (HTTPS)
  - TCP port 80 (HTTP)
  - UDP port 19302 (STUN)

**Inbound Rules:**
- ✅ TCP port 22 (SSH)
- ✅ TCP port 3000 (your app)
- ✅ UDP ports 10000-20000 (WebRTC)

## Test STUN Connectivity

Run the diagnostic script:

```bash
cd /home/ubuntu/workspace/remote_browser
./test-stun-connectivity.sh
```

Expected output if working:
```
✅ REACHABLE for at least one STUN server
```

## Alternative: Use AWS CLI

If you prefer command line, you can add rules using AWS CLI:

```bash
# Get your security group ID
SG_ID=$(aws ec2 describe-instances \
  --instance-ids $(ec2-metadata --instance-id | cut -d " " -f 2) \
  --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' \
  --output text)

# Add outbound UDP rule for STUN
aws ec2 authorize-security-group-egress \
  --group-id $SG_ID \
  --ip-permissions IpProtocol=udp,FromPort=19302,ToPort=19302,IpRanges=[{CidrIp=0.0.0.0/0,Description="STUN server access"}]

# Add inbound UDP rule for WebRTC
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --ip-permissions IpProtocol=udp,FromPort=10000,ToPort=20000,IpRanges=[{CidrIp=0.0.0.0/0,Description="WebRTC peer connections"}]
```

## Troubleshooting

### Still not working?

1. **Check if STUN servers are reachable:**
   ```bash
   ./test-stun-connectivity.sh
   ```

2. **Check firewall on EC2:**
   ```bash
   sudo ufw status verbose
   ```
   (Should show "Default: allow (outgoing)")

3. **Test from EC2 directly:**
   ```bash
   timeout 3 bash -c "echo > /dev/udp/stun.l.google.com/19302" && echo "STUN reachable" || echo "STUN unreachable"
   ```

4. **Check Security Group rules:**
   - Go to EC2 Console → Security Groups
   - Verify rules are saved and active
   - Check if there are conflicting rules

5. **Check VPC/Network ACLs:**
   - VPC Network ACLs might be blocking traffic
   - Check VPC → Network ACLs for your subnet

6. **Consider using TURN server:**
   - If STUN alone doesn't work (complex NATs), add a TURN server
   - See `TURN_SERVER_SETUP.md` for details

## Quick Reference

**Required Ports:**
- **Outbound UDP 19302**: STUN servers
- **Inbound UDP 10000-20000**: WebRTC peer connections
- **Inbound TCP 22**: SSH
- **Inbound TCP 3000**: Your application

**STUN Servers Used:**
- `stun.l.google.com:19302`
- `stun1.l.google.com:19302`
- `stun2.l.google.com:19302`
- `stun3.l.google.com:19302`
- `stun4.l.google.com:19302`
- `stun.stunprotocol.org:3478`
