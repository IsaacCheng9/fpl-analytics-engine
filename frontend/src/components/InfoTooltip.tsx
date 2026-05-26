import { useRef, useState } from "react";
import { createPortal } from "react-dom";

// A "(?)" help marker that shows its tooltip instantly on hover and toggles it
// on click. The bubble is portalled to the body and fixed-positioned so a
// parent's overflow (e.g. the scrollable table) never clips it.
export function InfoTooltip({ text }: { text: string }) {
	const [pinned, setPinned] = useState(false);
	const [hovered, setHovered] = useState(false);
	const ref = useRef<HTMLButtonElement>(null);
	const [pos, setPos] = useState({ top: 0, left: 0 });

	const place = () => {
		const rect = ref.current?.getBoundingClientRect();
		if (rect) {
			// Clamp so a wide bubble near the right edge stays on screen.
			const left = Math.min(rect.left, window.innerWidth - 272);
			setPos({ top: rect.bottom + 6, left: Math.max(8, left) });
		}
	};

	return (
		<>
			<button
				ref={ref}
				type="button"
				aria-label="Show explanation"
				className="cursor-help select-none text-xs text-zinc-400 hover:text-zinc-600"
				onClick={(event) => {
					event.stopPropagation();
					place();
					setPinned((value) => !value);
				}}
				onMouseEnter={() => {
					place();
					setHovered(true);
				}}
				onMouseLeave={() => setHovered(false)}
			>
				(?)
			</button>
			{(pinned || hovered) &&
				createPortal(
					<span
						className="fixed z-50 max-w-64 rounded-md bg-zinc-900 px-2 py-1 font-normal text-white text-xs shadow-lg"
						style={{ top: pos.top, left: pos.left }}
					>
						{text}
					</span>,
					document.body,
				)}
		</>
	);
}
