import { useState, useRef, useEffect } from 'react'
import io from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

export default function WebRTCTest() {
  const [socket, setSocket] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [iceConnectionState, setIceConnectionState] = useState('new')
  const [dataChannelState, setDataChannelState] = useState('closed')
  const [messages, setMessages] = useState([])
  const [testMessage, setTestMessage] = useState('')
  const [bytesReceived, setBytesReceived] = useState(0)
  const [bytesSent, setBytesSent] = useState(0)
  
  const peerConnectionRef = useRef(null)
  const dataChannelRef = useRef(null)
  const socketRef = useRef(null)

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    })
    
    socketRef.current = newSocket

    newSocket.on('connect', () => {
      console.log('[Test] Socket connected:', newSocket.id)
      setIsConnected(true)
      addMessage('Socket connected', 'success')
    })

    newSocket.on('disconnect', () => {
      console.log('[Test] Socket disconnected')
      setIsConnected(false)
      addMessage('Socket disconnected', 'error')
    })

    newSocket.on('connect_error', (error) => {
      console.error('[Test] Socket connection error:', error)
      addMessage(`Connection error: ${error.message}`, 'error')
    })

    // WebRTC offer handler
    newSocket.on('webrtc_offer', async ({ offer }) => {
      console.log('[Test] Received WebRTC offer:', offer)
      addMessage('Received WebRTC offer', 'info')
      await handleWebRTCOffer(offer)
    })

    // ICE candidate handler
    newSocket.on('webrtc_ice_candidate', async ({ candidate }) => {
      console.log('[Test] Received ICE candidate:', candidate)
      if (peerConnectionRef.current && candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
          addMessage('ICE candidate added', 'info')
        } catch (error) {
          console.error('[Test] Error adding ICE candidate:', error)
          addMessage(`Error adding ICE candidate: ${error.message}`, 'error')
        }
      }
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
      }
    }
  }, [])

  const handleWebRTCOffer = async (offer) => {
    try {
      // Get ICE servers (same as backend)
      const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
      
      
      // Create peer connection
      const pc = new RTCPeerConnection({ iceServers })

      peerConnectionRef.current = pc

      // Set up data channel handler (server creates the channel)
      pc.ondatachannel = (event) => {
        const channel = event.channel
        channel.binaryType = 'arraybuffer'
        dataChannelRef.current = channel

        channel.onopen = () => {
          console.log('[Test] Data channel opened')
          setDataChannelState(channel.readyState)
          addMessage('Data channel opened!', 'success')
        }

        channel.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            const bytes = event.data.byteLength
            setBytesReceived(prev => prev + bytes)
            addMessage(`Received ${bytes} bytes (binary)`, 'info')
          } else {
            const text = event.data
            setBytesReceived(prev => prev + text.length)
            addMessage(`Received: ${text}`, 'success')
          }
        }

        channel.onerror = (error) => {
          console.error('[Test] Data channel error:', error)
          addMessage('Data channel error', 'error')
        }

        channel.onclose = () => {
          console.log('[Test] Data channel closed')
          setDataChannelState('closed')
          addMessage('Data channel closed', 'warning')
        }
      }

      // ICE candidate handler
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          console.log('[Test] Sending ICE candidate:', event.candidate)
          socketRef.current.emit('webrtc_ice_candidate', {
            candidate: event.candidate
            // No tabId - this identifies it as a test connection
          })
        } else {
          console.log('[Test] ICE candidate gathering complete')
        }
      }

      // Connection state handlers
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState
        setIceConnectionState(state)
        addMessage(`ICE connection state: ${state}`, 'info')
        
        if (state === 'connected' || state === 'completed') {
          addMessage('✅ ICE connection established!', 'success')
        } else if (state === 'failed') {
          addMessage('❌ ICE connection failed', 'error')
        }
      }

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        setConnectionStatus(state)
        addMessage(`Connection state: ${state}`, 'info')
        
        if (state === 'connected') {
          addMessage('✅ WebRTC connection established!', 'success')
        } else if (state === 'failed' || state === 'closed') {
          addMessage(`❌ Connection ${state}`, 'error')
        }
      }

      // Set remote description and create answer
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      // Send answer to server (no tabId for test connections)
      if (socketRef.current) {
        socketRef.current.emit('webrtc_answer', {
          answer: pc.localDescription
          // No tabId - this identifies it as a test connection
        })
        addMessage('Sent WebRTC answer', 'info')
      }
    } catch (error) {
      console.error('[Test] Error handling offer:', error)
      addMessage(`Error: ${error.message}`, 'error')
    }
  }

  const startWebRTC = () => {
    if (!socketRef.current || !isConnected) {
      addMessage('Socket not connected', 'error')
      return
    }
    addMessage('Requesting WebRTC connection...', 'info')
    socketRef.current.emit('webrtc_test_start')
  }

  const sendTestMessage = () => {
    if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
      addMessage('Data channel not open', 'error')
      return
    }

    if (!testMessage.trim()) {
      addMessage('Message is empty', 'warning')
      return
    }

    try {
      dataChannelRef.current.send(testMessage)
      setBytesSent(prev => prev + testMessage.length)
      addMessage(`Sent: ${testMessage}`, 'info')
      setTestMessage('')
    } catch (error) {
      console.error('[Test] Error sending message:', error)
      addMessage(`Error sending: ${error.message}`, 'error')
    }
  }

  const sendTestBinary = () => {
    if (!dataChannelRef.current || dataChannelRef.current.readyState !== 'open') {
      addMessage('Data channel not open', 'error')
      return
    }

    try {
      // Create a test binary message (1KB of data)
      const buffer = new ArrayBuffer(1024)
      const view = new Uint8Array(buffer)
      for (let i = 0; i < view.length; i++) {
        view[i] = i % 256
      }
      
      dataChannelRef.current.send(buffer)
      setBytesSent(prev => prev + buffer.byteLength)
      addMessage(`Sent ${buffer.byteLength} bytes (binary)`, 'info')
    } catch (error) {
      console.error('[Test] Error sending binary:', error)
      addMessage(`Error sending binary: ${error.message}`, 'error')
    }
  }

  const addMessage = (text, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    setMessages(prev => [...prev, { text, type, timestamp }])
  }

  const clearMessages = () => {
    setMessages([])
    setBytesReceived(0)
    setBytesSent(0)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">WebRTC Connection Test</h1>
        
        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Socket</div>
            <div className={`text-xl font-bold ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Connection</div>
            <div className={`text-xl font-bold ${
              connectionStatus === 'connected' ? 'text-green-400' : 
              connectionStatus === 'failed' ? 'text-red-400' : 
              'text-yellow-400'
            }`}>
              {connectionStatus}
            </div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">ICE State</div>
            <div className={`text-xl font-bold ${
              iceConnectionState === 'connected' || iceConnectionState === 'completed' ? 'text-green-400' : 
              iceConnectionState === 'failed' ? 'text-red-400' : 
              'text-yellow-400'
            }`}>
              {iceConnectionState}
            </div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Data Channel</div>
            <div className={`text-xl font-bold ${
              dataChannelState === 'open' ? 'text-green-400' : 
              dataChannelState === 'closed' ? 'text-red-400' : 
              'text-yellow-400'
            }`}>
              {dataChannelState}
            </div>
          </div>
        </div>

        {/* Data Transfer Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Bytes Received</div>
            <div className="text-2xl font-bold text-blue-400">
              {(bytesReceived / 1024).toFixed(2)} KB
            </div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Bytes Sent</div>
            <div className="text-2xl font-bold text-green-400">
              {(bytesSent / 1024).toFixed(2)} KB
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-xl font-bold mb-4">Controls</h2>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={startWebRTC}
              disabled={!isConnected}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded"
            >
              Start WebRTC
            </button>
            <div className="flex gap-2 flex-1 min-w-[300px]">
              <input
                type="text"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendTestMessage()}
                placeholder="Enter test message..."
                className="flex-1 px-4 py-2 bg-gray-700 rounded text-white"
              />
              <button
                onClick={sendTestMessage}
                disabled={dataChannelState !== 'open'}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded"
              >
                Send Text
              </button>
              <button
                onClick={sendTestBinary}
                disabled={dataChannelState !== 'open'}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded"
              >
                Send Binary (1KB)
              </button>
            </div>
            <button
              onClick={clearMessages}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
            >
              Clear Logs
            </button>
          </div>
        </div>

        {/* Messages Log */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Messages Log</h2>
            <div className="text-sm text-gray-400">{messages.length} messages</div>
          </div>
          <div className="bg-gray-900 rounded p-4 h-96 overflow-y-auto font-mono text-sm">
            {messages.length === 0 ? (
              <div className="text-gray-500">No messages yet...</div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`mb-2 ${
                    msg.type === 'success' ? 'text-green-400' :
                    msg.type === 'error' ? 'text-red-400' :
                    msg.type === 'warning' ? 'text-yellow-400' :
                    'text-gray-300'
                  }`}
                >
                  <span className="text-gray-500">[{msg.timestamp}]</span> {msg.text}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
