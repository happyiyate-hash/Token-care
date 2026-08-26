import React, { useRef } from 'react';
import { motion, useDragControls } from 'motion/react';
import { Layers, Bookmark, Sparkles } from 'lucide-react';

interface FloatingSavedTokensBadgeProps {
  count: number;
  onClick: () => void;
  containerRef?: React.RefObject<HTMLElement | null>;
}

export const FloatingSavedTokensBadge: React.FC<FloatingSavedTokensBadgeProps> = ({
  count,
  onClick,
}) => {
  const isDraggingRef = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  if (count <= 0) return null;

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0.15}
      onDragStart={(_, info) => {
        isDraggingRef.current = false;
        dragStartPos.current = { x: info.point.x, y: info.point.y };
      }}
      onDrag={(_, info) => {
        const dx = Math.abs(info.point.x - dragStartPos.current.x);
        const dy = Math.abs(info.point.y - dragStartPos.current.y);
        if (dx > 6 || dy > 6) {
          isDraggingRef.current = true;
        }
      }}
      onDragEnd={() => {
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 120);
      }}
      initial={{ scale: 0, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 380, damping: 24 }}
      onClick={(e) => {
        e.stopPropagation();
        if (!isDraggingRef.current) {
          onClick();
        }
      }}
      className="fixed bottom-24 right-4 z-50 cursor-grab active:cursor-grabbing touch-none select-none"
      style={{ touchAction: 'none' }}
      title="View My Saved Tokens"
    >
      <div className="relative group">
        {/* Glowing pulse ring */}
        <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-emerald-500 to-green-400 opacity-60 blur-sm group-hover:opacity-100 transition duration-300 animate-pulse" />

        {/* Main Floating Circle Button */}
        <div className="relative w-13 h-13 rounded-full bg-[#080D1A]/95 backdrop-blur-xl border-2 border-emerald-400/80 shadow-[0_0_25px_rgba(34,197,94,0.45)] flex items-center justify-center text-emerald-400 transition-all duration-200">
          <Layers className="w-6 h-6 stroke-[2.2] text-[#4ADE80] group-hover:scale-110 transition-transform" />

          {/* Dynamic Badge Counter */}
          <motion.div
            key={count}
            initial={{ scale: 0.5, y: -4 }}
            animate={{ scale: 1, y: 0 }}
            className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1.5 rounded-full bg-gradient-to-r from-[#22C55E] to-[#16A34A] text-black font-black text-[11px] font-mono flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.6)] border-2 border-[#080D1A]"
          >
            {count}
          </motion.div>
        </div>

        {/* Floating Tooltip Label */}
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap bg-black/90 border border-emerald-500/40 text-[9px] font-bold text-emerald-300 px-1.5 py-0.5 rounded-md shadow-md">
          My Saved ({count})
        </div>
      </div>
    </motion.div>
  );
};
