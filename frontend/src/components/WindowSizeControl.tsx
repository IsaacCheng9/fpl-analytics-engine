import { clampWindowSize, WINDOW_MAX, WINDOW_MIN } from "../state";
import { fieldClass, labelClass } from "../styles";

export function WindowSizeControl({
	value,
	onChange,
}: {
	value: number;
	onChange: (value: number) => void;
}) {
	const fillPct = ((value - WINDOW_MIN) / (WINDOW_MAX - WINDOW_MIN)) * 100;
	return (
		<label htmlFor="window-size" className={labelClass}>
			Window (Gameweeks)
			<span className="mt-1 flex items-center gap-2">
				<input
					id="window-size"
					type="range"
					min={WINDOW_MIN}
					max={WINDOW_MAX}
					step={1}
					value={value}
					onChange={(e) => onChange(clampWindowSize(Number(e.target.value)))}
					className="range-slider w-32"
					style={{
						background: `linear-gradient(to right, var(--slider-fill) 0%, var(--slider-fill) ${fillPct}%, var(--slider-track) ${fillPct}%, var(--slider-track) 100%)`,
					}}
				/>
				<input
					type="number"
					min={WINDOW_MIN}
					max={WINDOW_MAX}
					step={1}
					aria-label="Window size in gameweeks"
					className={`${fieldClass} w-14`}
					value={value}
					onChange={(e) => onChange(clampWindowSize(Number(e.target.value)))}
				/>
			</span>
		</label>
	);
}
