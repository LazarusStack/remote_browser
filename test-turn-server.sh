#!/bin/bash
# Test TURN Server Connectivity

echo "🧪 Testing TURN Server Configuration..."
echo ""

TURN_SERVER="13.126.43.172"
TURN_PORT="3478"
TURN_USER="turnuser"
TURN_PASS="turnpassword"

echo "1. Testing STUN connectivity..."
timeout 3 turnutils_stunclient $TURN_SERVER 2>&1 | head -10 || echo "   ❌ STUN test failed"

echo ""
echo "2. Testing TURN allocation..."
timeout 5 turnutils_peer -L 127.0.0.1:50000 -X -v -n 1 -u $TURN_USER -w $TURN_PASS $TURN_SERVER:$TURN_PORT 2>&1 | head -20 || echo "   ❌ TURN allocation test failed"

echo ""
echo "3. Checking TURN server status..."
sudo systemctl is-active coturn > /dev/null && echo "   ✅ coturn service is running" || echo "   ❌ coturn service is not running"

echo ""
echo "4. Checking if port 3478 is listening..."
sudo ss -tuln | grep 3478 && echo "   ✅ Port 3478 is listening" || echo "   ❌ Port 3478 is not listening"

echo ""
echo "5. Checking security group (manual check needed)..."
echo "   ⚠️  Verify in AWS Console that Security Group allows:"
echo "      - Inbound UDP 3478 from 0.0.0.0/0"
echo "      - Inbound TCP 3478 from 0.0.0.0/0"
echo "      - Inbound UDP 49160-49200 from 0.0.0.0/0"

echo ""
echo "6. TURN Server Configuration:"
echo "   URL: turn:$TURN_SERVER:$TURN_PORT"
echo "   Username: $TURN_USER"
echo "   Password: $TURN_PASS"
echo "   Realm: ec2-turn"
