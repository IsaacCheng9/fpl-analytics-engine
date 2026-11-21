import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "fpl-theme";
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function isTheme(value: string | null): value is Theme {
	return value === "light" || value === "dark" || value === "system";
}

function readStoredTheme(): Theme {
	if (typeof window === "undefined") {
		return "system";
	}
	try {
		const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
		return isTheme(stored) ? stored : "system";
	} catch {
		return "system";
	}
}

function writeStoredTheme(theme: Theme) {
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// Ignore blocked storage; the toggle should still work for this session.
	}
}

function getSystemPrefersDark(): boolean {
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function"
	) {
		return false;
	}
	return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

export function useTheme(): {
	theme: Theme;
	resolvedTheme: ResolvedTheme;
	setTheme: (theme: Theme) => void;
} {
	const [theme, setThemeState] = useState<Theme>(readStoredTheme);
	const [systemPrefersDark, setSystemPrefersDark] =
		useState<boolean>(getSystemPrefersDark);

	const setTheme = useCallback((nextTheme: Theme) => {
		setThemeState(nextTheme);
		writeStoredTheme(nextTheme);
	}, []);

	useEffect(() => {
		if (
			theme !== "system" ||
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function"
		) {
			return;
		}
		const media = window.matchMedia(DARK_MEDIA_QUERY);
		setSystemPrefersDark(media.matches);
		const onChange = (event: MediaQueryListEvent) => {
			setSystemPrefersDark(event.matches);
		};
		if (typeof media.addEventListener === "function") {
			media.addEventListener("change", onChange);
			return () => media.removeEventListener("change", onChange);
		}
		media.addListener(onChange);
		return () => media.removeListener(onChange);
	}, [theme]);

	const resolvedTheme: ResolvedTheme =
		theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;

	useEffect(() => {
		document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
	}, [resolvedTheme]);

	return { theme, resolvedTheme, setTheme };
}
