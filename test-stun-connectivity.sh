#!/bin/bash
# STUN Connectivity Test Script for EC2
# This script tests if STUN servers are reachable from your EC2 instance

echo "🔍 Testing STUN Server Connectivity..."
echo ""

# Test Google STUN servers
STUN_SERVERS=(
  "stun.l.google.com:19302"
  "stun1.l.google.com:19302"
  "stun2.l.google.com:19302"
  "stun.stunprotocol.org:3478"
)

SUCCESS_COUNT=0
FAIL_COUNT=0

for server in "${STUN_SERVERS[@]}"; do
  host=$(echo $server | cut -d: -f1)
  port=$(echo $server | cut -d: -f2)
  
  echo -n "Testing $server... "
  
  # Try UDP connection with timeout
  timeout 3 bash -c "echo > /dev/udp/$host/$port" 2>/dev/null
  if [ $? -eq 0 ]; then
    echo "✅ REACHABLE"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    echo "❌ UNREACHABLE"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

echo ""
echo "Results: $SUCCESS_COUNT reachable, $FAIL_COUNT unreachable"

if [ $SUCCESS_COUNT -eq 0 ]; then
  echo ""
  echo "❌ CRITICAL: No STUN servers are reachable!"
  echo ""
  echo "This usually means:"
  echo "1. AWS Security Group is blocking outbound UDP to port 19302"
  echo "2. Network/firewall is blocking UDP traffic"
  echo ""
  echo "To fix:"
  echo "1. Go to AWS Console → EC2 → Security Groups"
  echo "2. Find your instance's security group"
  echo "3. Add Outbound Rule:"
  echo "   - Type: Custom UDP"
  echo "   - Port: 19302"
  echo "   - Destination: 0.0.0.0/0"
  echo "4. Also add Inbound Rule for WebRTC:"
  echo "   - Type: Custom UDP"
  echo "   - Port Range: 10000-20000"
  echo "   - Source: 0.0.0.0/0 (or restrict to your client IPs)"
else
  echo ""
  echo "✅ At least one STUN server is reachable"
  echo "If WebRTC still doesn't work, check:"
  echo "1. Inbound UDP ports 10000-20000 are open in Security Group"
  echo "2. Client can reach your EC2 instance"
fi

echo ""
echo "Current EC2 Public IP: $(curl -s ifconfig.me)"
echo "Check if this matches your instance's public IP in AWS Console"
