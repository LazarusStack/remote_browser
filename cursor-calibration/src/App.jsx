import { useState, useEffect, useRef } from 'react'

function App() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isInside, setIsInside] = useState(false)
  const [clickPos, setClickPos] = useState(null)
  const boxRef = useRef(null)
  const containerRef = useRef(null)

  const BOX_SIZE = 400
  const BOX_X = 100
  const BOX_Y = 100

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY })
      
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        
        const inside = 
          x >= BOX_X && 
          x <= BOX_X + BOX_SIZE && 
          y >= BOX_Y && 
          y <= BOX_Y + BOX_SIZE
        
        setIsInside(inside)
      }
    }

    const handleClick = (e) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        
        setClickPos({ x, y })
        
        // Check if click was inside box
        const inside = 
          x >= BOX_X && 
          x <= BOX_X + BOX_SIZE && 
          y >= BOX_Y && 
          y <= BOX_Y + BOX_SIZE
        
        if (inside) {
          console.log('Click was INSIDE the box!')
        } else {
          console.log('Click was OUTSIDE the box!')
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('click', handleClick)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('click', handleClick)
    }
  }, [])

  const getRelativePos = () => {
    if (!containerRef.current) return { x: 0, y: 0 }
    const rect = containerRef.current.getBoundingClientRect()
    return {
      x: mousePos.x - rect.left,
      y: mousePos.y - rect.top
    }
  }

  const relPos = getRelativePos()
  const boxLeft = BOX_X
  const boxRight = BOX_X + BOX_SIZE
  const boxTop = BOX_Y
  const boxBottom = BOX_Y + BOX_SIZE

  return (
    <div 
      ref={containerRef}
      className="w-full h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden"
    >
      {/* Instructions */}
      <div className="absolute top-4 left-4 z-20 bg-gray-800/90 backdrop-blur-sm rounded-lg p-4 border border-gray-700 max-w-sm">
        <h2 className="text-lg font-bold text-white mb-2">Cursor Calibration Tool</h2>
        <p className="text-sm text-gray-300 mb-3">
          Move your cursor around the box. The indicator will show if you're inside or outside.
        </p>
        <div className="space-y-1 text-xs text-gray-400">
          <p><span className="text-green-400">Green</span> = Inside box</p>
          <p><span className="text-red-400">Red</span> = Outside box</p>
        </div>
      </div>

      {/* Calibration Box */}
      <div
        ref={boxRef}
        className="absolute border-4 border-blue-500 bg-blue-500/10 backdrop-blur-sm"
        style={{
          left: `${BOX_X}px`,
          top: `${BOX_Y}px`,
          width: `${BOX_SIZE}px`,
          height: `${BOX_SIZE}px`,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400 mb-2">Calibration Box</div>
            <div className="text-sm text-gray-300">
              {BOX_SIZE} × {BOX_SIZE}px
            </div>
          </div>
        </div>
      </div>

      {/* Cursor Position Indicator */}
      <div
        className={`absolute w-4 h-4 rounded-full border-2 pointer-events-none transition-all duration-75 ${
          isInside 
            ? 'bg-green-500 border-green-400 shadow-lg shadow-green-500/50' 
            : 'bg-red-500 border-red-400 shadow-lg shadow-red-500/50'
        }`}
        style={{
          left: `${mousePos.x - 8}px`,
          top: `${mousePos.y - 8}px`,
          transform: 'translate(0, 0)',
        }}
      />

      {/* Status Panel */}
      <div className="absolute bottom-4 left-4 z-20 bg-gray-800/90 backdrop-blur-sm rounded-lg p-4 border border-gray-700 min-w-[300px]">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isInside ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="font-medium text-white">
              Status: {isInside ? 'INSIDE' : 'OUTSIDE'} the box
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-700">
            <div>
              <div className="text-xs text-gray-400 mb-1">Mouse Position</div>
              <div className="font-mono text-white">
                X: {relPos.x.toFixed(0)}px<br />
                Y: {relPos.y.toFixed(0)}px
              </div>
            </div>
            
            <div>
              <div className="text-xs text-gray-400 mb-1">Box Boundaries</div>
              <div className="font-mono text-xs text-gray-300">
                X: {boxLeft} - {boxRight}<br />
                Y: {boxTop} - {boxBottom}
              </div>
            </div>
          </div>

          {clickPos && (
            <div className="pt-2 border-t border-gray-700">
              <div className="text-xs text-gray-400 mb-1">Last Click</div>
              <div className="font-mono text-white">
                X: {clickPos.x.toFixed(0)}px, Y: {clickPos.y.toFixed(0)}px
              </div>
              <div className={`text-xs mt-1 ${
                clickPos.x >= boxLeft && clickPos.x <= boxRight && 
                clickPos.y >= boxTop && clickPos.y <= boxBottom
                  ? 'text-green-400' 
                  : 'text-red-400'
              }`}>
                {clickPos.x >= boxLeft && clickPos.x <= boxRight && 
                 clickPos.y >= boxTop && clickPos.y <= boxBottom
                  ? '✓ Click was INSIDE' 
                  : '✗ Click was OUTSIDE'}
              </div>
            </div>
          )}

          {/* Distance from box */}
          {!isInside && (
            <div className="pt-2 border-t border-gray-700">
              <div className="text-xs text-gray-400 mb-1">Distance from Box</div>
              <div className="font-mono text-xs text-white">
                {relPos.x < boxLeft && (
                  <>Left: {Math.abs(relPos.x - boxLeft).toFixed(0)}px</>
                )}
                {relPos.x > boxRight && (
                  <>Right: {Math.abs(relPos.x - boxRight).toFixed(0)}px</>
                )}
                {relPos.x >= boxLeft && relPos.x <= boxRight && relPos.y < boxTop && (
                  <>Top: {Math.abs(relPos.y - boxTop).toFixed(0)}px</>
                )}
                {relPos.x >= boxLeft && relPos.x <= boxRight && relPos.y > boxBottom && (
                  <>Bottom: {Math.abs(relPos.y - boxBottom).toFixed(0)}px</>
                )}
                {relPos.x < boxLeft && relPos.y < boxTop && (
                  <>Top-Left: {Math.sqrt(Math.pow(relPos.x - boxLeft, 2) + Math.pow(relPos.y - boxTop, 2)).toFixed(0)}px</>
                )}
                {relPos.x > boxRight && relPos.y < boxTop && (
                  <>Top-Right: {Math.sqrt(Math.pow(relPos.x - boxRight, 2) + Math.pow(relPos.y - boxTop, 2)).toFixed(0)}px</>
                )}
                {relPos.x < boxLeft && relPos.y > boxBottom && (
                  <>Bottom-Left: {Math.sqrt(Math.pow(relPos.x - boxLeft, 2) + Math.pow(relPos.y - boxBottom, 2)).toFixed(0)}px</>
                )}
                {relPos.x > boxRight && relPos.y > boxBottom && (
                  <>Bottom-Right: {Math.sqrt(Math.pow(relPos.x - boxRight, 2) + Math.pow(relPos.y - boxBottom, 2)).toFixed(0)}px</>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid overlay for reference */}
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }}
      />
    </div>
  )
}

export default App
