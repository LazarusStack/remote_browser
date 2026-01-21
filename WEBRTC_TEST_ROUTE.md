# WebRTC Test Route

A dedicated test route has been created to test WebRTC data transfer functionality before implementing it in the main browser component.

## Route

- **Frontend**: `/webrtc-test`
- **Backend**: Handles test connections via `webrtc_test_start` event

## Features

### Frontend (`/webrtc-test`)
- Real-time connection status monitoring
- ICE connection state tracking
- Data channel state monitoring
- Send/receive text messages
- Send/receive binary data
- Data transfer statistics (bytes sent/received)
- Message log with timestamps

### Backend
- Simplified WebRTC test handler
- Automatic test data transmission (every 2-3 seconds)
- Bidirectional data transfer support
- Proper cleanup on disconnect

## How to Use

1. **Start the server**:
   ```bash
   cd server
   npm run dev
   ```

2. **Start the frontend**:
   ```bash
   cd cloud-browser-ui
   npm run dev
   ```

3. **Navigate to test route**:
   - Open browser to `http://localhost:5173/webrtc-test` (or your frontend URL)
   - Or click "WebRTC Test" in the navigation bar

4. **Test the connection**:
   - Click "Start WebRTC" button
   - Wait for connection to establish (watch status cards)
   - Once connected, you should see:
     - Automatic test messages from server every 2 seconds
     - Automatic binary data from server every 3 seconds
   - Test sending data:
     - Type a message and click "Send Text"
     - Click "Send Binary (1KB)" to send binary data

## Connection Flow

1. Client connects via Socket.IO
2. Client clicks "Start WebRTC"
3. Server creates peer connection and data channel
4. Server sends WebRTC offer to client
5. Client creates answer and sends back
6. ICE candidates are exchanged
7. Connection establishes
8. Data channel opens
9. Server starts sending test data automatically
10. Client can send data back

## Status Indicators

- **Socket**: Green = Connected, Red = Disconnected
- **Connection**: Shows WebRTC connection state (new → connecting → connected)
- **ICE State**: Shows ICE connection state (new → checking → connected/completed)
- **Data Channel**: Shows data channel state (closed → connecting → open)

## Testing Checklist

- [ ] Socket connects successfully
- [ ] WebRTC offer/answer exchange works
- [ ] ICE candidates are exchanged
- [ ] Connection state reaches "connected"
- [ ] Data channel opens
- [ ] Server messages are received
- [ ] Client can send text messages
- [ ] Client can send binary data
- [ ] Data transfer statistics update correctly
- [ ] Connection cleanup works on disconnect

## Next Steps

Once the test route works perfectly:
1. Identify any issues or improvements needed
2. Apply the same patterns to the main browser component
3. Integrate WebRTC properly in `useWebRTC.js` hook
4. Test with actual screenshot data transfer

## Environment Variables

The frontend uses `VITE_SOCKET_URL` environment variable (defaults to `http://localhost:3000`).

Create a `.env` file in `cloud-browser-ui/` if needed:
```
VITE_SOCKET_URL=http://localhost:3000
```
