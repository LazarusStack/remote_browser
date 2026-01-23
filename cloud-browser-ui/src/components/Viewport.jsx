// Browser viewport component

export default function Viewport({
  activeTab,
  screenshot,
  isLoading,
  viewportRef,
  scaleRef,
  onClick,
  onMouseMove,
  onKeyDown
}) {
  return (
    <div className="w-full h-full flex items-center justify-center relative">
      <div
        ref={viewportRef}
        className="bg-white overflow-visible cursor-pointer relative focus:outline-none"
        style={{
          transform: `scale(${scaleRef.current})`,
          transformOrigin: "center center"
        }}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onContextMenu={(e) => {
          e.preventDefault();
          onClick(e);
        }}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => {
          // Focus on click to enable keyboard input
          if (viewportRef.current) {
            viewportRef.current.focus();
          }
        }}
      >
        {isLoading && !screenshot ? (
          <div className="w-[1280px] h-[720px] flex items-center justify-center bg-gray-100">
            <div className="text-gray-500">Loading...</div>
          </div>
        ) : screenshot ? (
          <img
            src={screenshot}
            alt="Browser viewport"
            className="block"
            draggable={false}
          />
        ) : (
          <div className="w-[1280px] h-[720px] flex items-center justify-center bg-gray-100">
            <div className="text-gray-500">No screenshot available</div>
          </div>
        )}
      </div>
    </div>
  );
}
