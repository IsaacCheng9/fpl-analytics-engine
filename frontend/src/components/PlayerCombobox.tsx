import { useEffect, useMemo, useState } from "react";
import type { FormPlayer } from "../api";

export type PlayerOption = Pick<
	FormPlayer,
	"element" | "web_name" | "position" | "team_name"
>;

export function playerOptionLabel(option: PlayerOption): string {
	return `${option.web_name} - ${option.team_name ?? "No Team"} - ${option.position ?? "-"}`;
}

const MAX_VISIBLE_OPTIONS = 50;

export function PlayerCombobox({
	id,
	label,
	options,
	value,
	onChange,
}: {
	id: string;
	label: string;
	options: PlayerOption[];
	value: number | null;
	onChange: (element: number | null) => void;
}) {
	const selected = options.find((option) => option.element === value);
	const selectedLabel = selected ? playerOptionLabel(selected) : "";
	const [input, setInput] = useState(selectedLabel);
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);

	useEffect(() => {
		setInput(selectedLabel);
	}, [selectedLabel]);

	const { filtered, totalMatches } = useMemo(() => {
		const query = input.trim().toLowerCase();
		const matches =
			query === "" || query === selectedLabel.toLowerCase()
				? options
				: options.filter((option) =>
						playerOptionLabel(option).toLowerCase().includes(query),
					);
		return {
			filtered: matches.slice(0, MAX_VISIBLE_OPTIONS),
			totalMatches: matches.length,
		};
	}, [input, options, selectedLabel]);

	function selectOption(option: PlayerOption) {
		setInput(playerOptionLabel(option));
		setOpen(false);
		onChange(option.element);
	}

	function handleInputChange(nextValue: string) {
		setInput(nextValue);
		setActiveIndex(0);
		if (nextValue.trim() === "") {
			onChange(null);
			setOpen(true);
			return;
		}
		const exactMatch = options.find(
			(option) =>
				playerOptionLabel(option).toLowerCase() ===
				nextValue.trim().toLowerCase(),
		);
		if (exactMatch) {
			onChange(exactMatch.element);
			setOpen(false);
			return;
		}
		setOpen(true);
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			if (!open) {
				setOpen(true);
				setActiveIndex(0);
				return;
			}
			setActiveIndex((index) =>
				filtered.length === 0 ? 0 : (index + 1) % filtered.length,
			);
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			if (!open) {
				setOpen(true);
				setActiveIndex(Math.max(0, filtered.length - 1));
				return;
			}
			setActiveIndex((index) =>
				filtered.length === 0
					? 0
					: (index - 1 + filtered.length) % filtered.length,
			);
			return;
		}
		if (event.key === "Enter" && open && filtered.length > 0) {
			event.preventDefault();
			const option = filtered[Math.min(activeIndex, filtered.length - 1)];
			if (option) {
				selectOption(option);
			}
			return;
		}
		if (event.key === "Escape" && open) {
			event.preventDefault();
			event.stopPropagation();
			setOpen(false);
			setInput(selectedLabel);
		}
	}

	const listboxId = `${id}-listbox`;
	const safeActiveIndex =
		filtered.length > 0 ? Math.min(activeIndex, filtered.length - 1) : -1;
	const activeOption =
		open && safeActiveIndex >= 0 ? filtered[safeActiveIndex] : undefined;

	return (
		<div className="relative flex min-w-0 flex-1 flex-col text-xs font-medium text-zinc-600 dark:text-zinc-300">
			<label htmlFor={id}>{label}</label>
			<input
				id={id}
				type="search"
				role="combobox"
				aria-expanded={open}
				aria-controls={open ? listboxId : undefined}
				aria-autocomplete="list"
				aria-activedescendant={
					open && activeOption
						? `${id}-option-${activeOption.element}`
						: undefined
				}
				placeholder="Search player, club, or position..."
				className="mt-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
				value={input}
				onFocus={() => {
					setActiveIndex(0);
					setOpen(true);
				}}
				onClick={() => setOpen(true)}
				onChange={(event) => handleInputChange(event.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={() => {
					setOpen(false);
					setInput(selectedLabel);
				}}
			/>
			{open ? (
				<div
					id={listboxId}
					role="listbox"
					aria-label={`${label} options`}
					className="absolute top-full right-0 left-0 z-30 mt-1 max-h-56 overflow-auto rounded-md border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
				>
					{filtered.length === 0 ? (
						<div className="px-2.5 py-1.5 text-zinc-500 dark:text-zinc-400">
							No matching players
						</div>
					) : (
						<>
							{filtered.map((option, index) => {
								const isActive = index === safeActiveIndex;
								const isSelected = option.element === value;
								return (
									<div
										key={option.element}
										id={`${id}-option-${option.element}`}
										role="option"
										tabIndex={-1}
										aria-selected={isSelected}
										className={`cursor-pointer px-2.5 py-1.5 ${
											isActive
												? "bg-sky-50 text-sky-900 dark:bg-sky-950/80 dark:text-sky-200"
												: isSelected
													? "bg-zinc-50 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
													: "text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/70"
										}`}
										onMouseEnter={() => setActiveIndex(index)}
										onMouseDown={(event) => {
											event.preventDefault();
											selectOption(option);
										}}
									>
										{playerOptionLabel(option)}
									</div>
								);
							})}
							{totalMatches > MAX_VISIBLE_OPTIONS ? (
								<div className="border-zinc-100 border-t px-2.5 py-1.5 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
									Showing {MAX_VISIBLE_OPTIONS} of {totalMatches} players - type
									to filter
								</div>
							) : null}
						</>
					)}
				</div>
			) : null}
		</div>
	);
}
