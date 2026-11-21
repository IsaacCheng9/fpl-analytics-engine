export const labelClass =
	"flex flex-col text-xs font-medium text-zinc-600 dark:text-zinc-300";
export const fieldClass =
	"rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500";
// Most controls sit below a label, so the shared input class adds the gap.
export const inputClass = `mt-1 ${fieldClass}`;
export const transferInputClass = `${inputClass} w-[5.5rem]`;
