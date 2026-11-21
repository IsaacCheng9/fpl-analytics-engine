import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { THEME_STORAGE_KEY, useTheme } from "./useTheme";

type MediaChangeListener = (event: MediaQueryListEvent) => void;

function mockLocalStorage() {
	const storage = new Map<string, string>();
	const localStorageMock: Storage = {
		get length() {
			return storage.size;
		},
		clear: () => storage.clear(),
		getItem: (key) => storage.get(key) ?? null,
		key: (index) => Array.from(storage.keys())[index] ?? null,
		removeItem: (key) => {
			storage.delete(key);
		},
		setItem: (key, value) => {
			storage.set(key, value);
		},
	};
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: localStorageMock,
	});
}

function mockMatchMedia(initialMatches: boolean) {
	let matches = initialMatches;
	const listeners = new Set<MediaChangeListener>();

	const mediaQueryList = {
		get matches() {
			return matches;
		},
		media: "(prefers-color-scheme: dark)",
		onchange: null,
		addEventListener: vi.fn((event: string, listener: MediaChangeListener) => {
			if (event === "change") {
				listeners.add(listener);
			}
		}),
		removeEventListener: vi.fn(
			(event: string, listener: MediaChangeListener) => {
				if (event === "change") {
					listeners.delete(listener);
				}
			},
		),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn(),
	};

	const matchMedia = vi.fn(() => mediaQueryList);
	vi.stubGlobal("matchMedia", matchMedia);

	return {
		mediaQueryList,
		setMatches(next: boolean) {
			matches = next;
			const event = { matches: next } as MediaQueryListEvent;
			for (const listener of listeners) {
				listener(event);
			}
		},
	};
}

beforeEach(() => {
	mockLocalStorage();
	window.localStorage.clear();
	document.documentElement.classList.remove("dark");
	mockMatchMedia(false);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	document.documentElement.classList.remove("dark");
});

describe("useTheme", () => {
	test("defaults to system mode and follows prefers-color-scheme", () => {
		const media = mockMatchMedia(true);
		const { result } = renderHook(() => useTheme());

		expect(result.current.theme).toBe("system");
		expect(result.current.resolvedTheme).toBe("dark");
		expect(document.documentElement).toHaveClass("dark");

		act(() => {
			media.setMatches(false);
		});

		expect(result.current.theme).toBe("system");
		expect(result.current.resolvedTheme).toBe("light");
		expect(document.documentElement).not.toHaveClass("dark");
	});

	test("persists explicit dark and light selections to localStorage", () => {
		const { result } = renderHook(() => useTheme());

		act(() => {
			result.current.setTheme("dark");
		});
		expect(result.current.theme).toBe("dark");
		expect(result.current.resolvedTheme).toBe("dark");
		expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
		expect(document.documentElement).toHaveClass("dark");

		act(() => {
			result.current.setTheme("light");
		});
		expect(result.current.theme).toBe("light");
		expect(result.current.resolvedTheme).toBe("light");
		expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
		expect(document.documentElement).not.toHaveClass("dark");
	});

	test("restores a stored theme and falls back to system on invalid values", () => {
		window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
		const first = renderHook(() => useTheme());
		expect(first.result.current.theme).toBe("dark");
		expect(first.result.current.resolvedTheme).toBe("dark");
		expect(document.documentElement).toHaveClass("dark");
		first.unmount();

		window.localStorage.setItem(THEME_STORAGE_KEY, "midnight");
		const second = renderHook(() => useTheme());
		expect(second.result.current.theme).toBe("system");
		expect(second.result.current.resolvedTheme).toBe("light");
		expect(document.documentElement).not.toHaveClass("dark");
	});

	test("re-reads system preference when returning from an explicit theme", () => {
		const media = mockMatchMedia(false);
		const { result } = renderHook(() => useTheme());

		act(() => {
			result.current.setTheme("light");
		});
		expect(media.mediaQueryList.removeEventListener).toHaveBeenCalled();

		// System preference changes while explicitly in light mode.
		media.setMatches(true);
		expect(result.current.resolvedTheme).toBe("light");

		act(() => {
			result.current.setTheme("system");
		});
		expect(result.current.theme).toBe("system");
		expect(result.current.resolvedTheme).toBe("dark");
		expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
		expect(document.documentElement).toHaveClass("dark");
	});

	test("cleans up the media listener on unmount", () => {
		const media = mockMatchMedia(false);
		const { unmount } = renderHook(() => useTheme());

		expect(media.mediaQueryList.addEventListener).toHaveBeenCalledTimes(1);
		unmount();
		expect(media.mediaQueryList.removeEventListener).toHaveBeenCalledTimes(1);
	});

	test("falls back to light when matchMedia is unavailable", () => {
		vi.stubGlobal("matchMedia", undefined);
		const { result } = renderHook(() => useTheme());

		expect(result.current.theme).toBe("system");
		expect(result.current.resolvedTheme).toBe("light");
		expect(document.documentElement).not.toHaveClass("dark");
	});

	test("supports legacy addListener and removeListener on MediaQueryList", () => {
		let matches = false;
		const listeners = new Set<MediaChangeListener>();
		const legacyMedia = {
			get matches() {
				return matches;
			},
			media: "(prefers-color-scheme: dark)",
			onchange: null,
			addListener: vi.fn((listener: MediaChangeListener) => {
				listeners.add(listener);
			}),
			removeListener: vi.fn((listener: MediaChangeListener) => {
				listeners.delete(listener);
			}),
			dispatchEvent: vi.fn(),
		};
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => legacyMedia),
		);

		const { result, unmount } = renderHook(() => useTheme());
		expect(legacyMedia.addListener).toHaveBeenCalledTimes(1);
		expect(result.current.resolvedTheme).toBe("light");

		act(() => {
			matches = true;
			for (const listener of listeners) {
				listener({ matches: true } as MediaQueryListEvent);
			}
		});
		expect(result.current.resolvedTheme).toBe("dark");
		expect(document.documentElement).toHaveClass("dark");

		unmount();
		expect(legacyMedia.removeListener).toHaveBeenCalledTimes(1);
	});

	test("ignores blocked localStorage reads and writes", () => {
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			value: {
				getItem: () => {
					throw new DOMException("Blocked", "SecurityError");
				},
				setItem: () => {
					throw new DOMException("Blocked", "SecurityError");
				},
			},
		});

		const { result } = renderHook(() => useTheme());
		expect(result.current.theme).toBe("system");
		expect(result.current.resolvedTheme).toBe("light");

		act(() => {
			result.current.setTheme("dark");
		});
		expect(result.current.theme).toBe("dark");
		expect(result.current.resolvedTheme).toBe("dark");
		expect(document.documentElement).toHaveClass("dark");
	});
});
