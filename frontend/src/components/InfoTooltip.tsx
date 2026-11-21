import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A "(?)" help marker that shows its tooltip on hover/focus and toggles it
// on click. The bubble is portalled to the body and fixed-positioned so a
// parent's overflow (e.g. the scrollable table) never clips it.
export function InfoTooltip({ text }: { text: string }) {
	const [pinned, setPinned] = useState(false);
	const [hovered, setHovered] = useState(false);
	const [focused, setFocused] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const tooltipRef = useRef<HTMLSpanElement>(null);
	const tooltipId = useId();
	const [pos, setPos] = useState({ top: 0, left: 0 });
	const open = pinned || hovered || focused;

	const close = () => {
		setPinned(false);
		setHovered(false);
		setFocused(false);
	};

	const place = () => {
		const rect = buttonRef.current?.getBoundingClientRect();
		if (rect) {
			// Clamp so a wide bubble near the right edge stays on screen.
			const left = Math.min(rect.left, window.innerWidth - 272);
			setPos({ top: rect.bottom + 6, left: Math.max(8, left) });
		}
	};

	useEffect(() => {
		if (!open) {
			return;
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				// Capture-phase dismissal prevents Escape from also closing a parent dialog.
				event.preventDefault();
				event.stopPropagation();
				setPinned(false);
				setHovered(false);
				setFocused(false);
			}
		}
		function onPointerDown(event: PointerEvent) {
			const target = event.target as Node | null;
			if (
				target &&
				!buttonRef.current?.contains(target) &&
				!tooltipRef.current?.contains(target)
			) {
				setPinned(false);
				setHovered(false);
				setFocused(false);
			}
		}
		function onScroll() {
			setPinned(false);
			setHovered(false);
			setFocused(false);
		}
		document.addEventListener("keydown", onKeyDown, true);
		document.addEventListener("pointerdown", onPointerDown);
		window.addEventListener("scroll", onScroll, {
			capture: true,
			passive: true,
		});
		return () => {
			document.removeEventListener("keydown", onKeyDown, true);
			document.removeEventListener("pointerdown", onPointerDown);
			window.removeEventListener("scroll", onScroll, { capture: true });
		};
	}, [open]);

	return (
		<>
			<button
				ref={buttonRef}
				type="button"
				aria-label="Show explanation"
				aria-expanded={open}
				aria-describedby={open ? tooltipId : undefined}
				className="cursor-help select-none text-xs text-zinc-400 hover:text-zinc-600 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-zinc-400"
				onClick={(event) => {
					event.stopPropagation();
					if (pinned) {
						close();
					} else {
						place();
						setPinned(true);
					}
				}}
				onMouseEnter={() => {
					place();
					setHovered(true);
				}}
				onMouseLeave={() => setHovered(false)}
				onFocus={() => {
					place();
					setFocused(true);
				}}
				onBlur={() => setFocused(false)}
			>
				(?)
			</button>
			{open &&
				createPortal(
					<span
						ref={tooltipRef}
						id={tooltipId}
						role="tooltip"
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
