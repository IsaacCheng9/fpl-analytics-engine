import { Monitor, Moon, Sun } from "lucide-react";
import type { Theme } from "../hooks/useTheme";

const THEME_OPTIONS = [
	{
		value: "light" as const,
		label: "Light theme",
		title: "Light mode",
		icon: Sun,
	},
	{
		value: "system" as const,
		label: "System theme",
		title: "System theme",
		icon: Monitor,
	},
	{
		value: "dark" as const,
		label: "Dark theme",
		title: "Dark mode",
		icon: Moon,
	},
];

export function ThemeToggle({
	theme,
	onChange,
}: {
	theme: Theme;
	onChange: (theme: Theme) => void;
}) {
	return (
		<fieldset className="inline-flex shrink-0 items-center rounded-md border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
			<legend className="sr-only">Theme</legend>
			{THEME_OPTIONS.map(({ value, label, title, icon: Icon }) => {
				const active = theme === value;
				return (
					<button
						key={value}
						type="button"
						aria-label={label}
						aria-pressed={active}
						title={title}
						onClick={() => onChange(value)}
						className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:-outline-offset-1 dark:focus-visible:outline-blue-400 ${
							active
								? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
								: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
						}`}
					>
						<Icon size={15} aria-hidden="true" />
					</button>
				);
			})}
		</fieldset>
	);
}
