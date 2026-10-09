import {
	type Cell,
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type RowData,
	type SortingState,
	type Table,
	type Updater,
	useReactTable,
} from "@tanstack/react-table";
import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from "lucide-react";
import {
	type CSSProperties,
	type ReactNode,
	type Ref,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { InfoTooltip } from "./InfoTooltip";

declare module "@tanstack/react-table" {
	// A tooltip explaining what a column means.
	interface ColumnMeta<TData extends RowData, TValue> {
		tooltip?: string;
		headerClassName?: string;
		// Right-align with fixed-width digits so magnitudes line up down a column.
		numeric?: boolean;
		cellStyle?: (cell: Cell<TData, TValue>) => CSSProperties | undefined;
	}
}

const ALL_ROWS = Number.MAX_SAFE_INTEGER;

function PaginationControls<T>({
	table,
	position,
	ref,
	onPageSizeChange,
	onNavigate,
}: {
	table: Table<T>;
	position: "top" | "bottom";
	ref?: Ref<HTMLElement>;
	onPageSizeChange?: (size: number) => void;
	onNavigate?: () => void;
}) {
	const id = useId();
	const { pageIndex, pageSize } = table.getState().pagination;
	const total = table.getRowCount();
	const start = total === 0 ? 0 : pageIndex * pageSize + 1;
	const end = Math.min((pageIndex + 1) * pageSize, total);
	const buttons = [
		{
			label: "First Page",
			icon: ChevronsLeft,
			disabled: !table.getCanPreviousPage(),
			onClick: () => table.firstPage(),
		},
		{
			label: "Previous Page",
			icon: ChevronLeft,
			disabled: !table.getCanPreviousPage(),
			onClick: () => table.previousPage(),
		},
		{
			label: "Next Page",
			icon: ChevronRight,
			disabled: !table.getCanNextPage(),
			onClick: () => table.nextPage(),
		},
		{
			label: "Last Page",
			icon: ChevronsRight,
			disabled: !table.getCanNextPage(),
			onClick: () => table.lastPage(),
		},
	];

	return (
		<nav
			ref={ref}
			tabIndex={-1}
			aria-label={`Table Pagination (${position === "top" ? "Top" : "Bottom"})`}
			className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-3 py-3 text-sm text-zinc-600 focus:outline-none"
		>
			<div className="flex flex-wrap items-center gap-x-5 gap-y-2">
				<div className="flex items-center gap-2">
					<label htmlFor={id}>Rows Per Page</label>
					<select
						id={id}
						className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-600"
						value={pageSize === ALL_ROWS ? "all" : pageSize}
						onChange={(event) => {
							const size =
								event.target.value === "all"
									? ALL_ROWS
									: Number(event.target.value);
							table.setPageSize(size);
							table.firstPage();
							onPageSizeChange?.(size);
							onNavigate?.();
						}}
					>
						{[10, 25, 50, 100].map((size) => (
							<option key={size} value={size}>
								{size}
							</option>
						))}
						<option value="all">All</option>
					</select>
				</div>
				<span
					className="tabular-nums"
					aria-live={position === "top" ? "polite" : undefined}
					aria-atomic="true"
				>
					{start}-{end} of {total} rows
				</span>
			</div>
			<div className="flex items-center gap-3">
				<span className="whitespace-nowrap tabular-nums">
					Page {total === 0 ? 0 : pageIndex + 1} of {table.getPageCount()}
				</span>
				<div className="flex gap-1">
					{buttons.map(({ label, icon: Icon, disabled, onClick }) => (
						<button
							key={label}
							type="button"
							aria-label={label}
							title={label}
							disabled={disabled}
							onClick={() => {
								onClick();
								onNavigate?.();
							}}
							className="flex size-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-600 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-white"
						>
							<Icon size={16} aria-hidden="true" />
						</button>
					))}
				</div>
			</div>
		</nav>
	);
}

export function DataTable<T>({
	data,
	columns,
	onRowClick,
	rowClassName,
	rowStickyClassName,
	renderRowActions,
	rowActionsHeader = "",
	rowActionsHeaderLabel = rowActionsHeader,
	rowActionsHeaderTooltip,
	stickyDataColumns = 0,
	emptyTitle = "No rows match.",
	emptyDescription,
	emptyAction,
	paginate = false,
	initialPageSize = 25,
	onPageSizeChange,
	sorting: controlledSorting,
	onSortingChange,
}: {
	data: T[];
	columns: ColumnDef<T>[];
	onRowClick?: (row: T) => void;
	rowClassName?: (row: T) => string;
	rowStickyClassName?: (row: T) => string;
	renderRowActions?: (row: T) => ReactNode;
	rowActionsHeader?: string;
	rowActionsHeaderLabel?: string;
	rowActionsHeaderTooltip?: string;
	stickyDataColumns?: number;
	emptyTitle?: string;
	emptyDescription?: string;
	emptyAction?: ReactNode;
	paginate?: boolean;
	initialPageSize?: number;
	onPageSizeChange?: (size: number) => void;
	sorting?: SortingState;
	onSortingChange?: (sorting: SortingState) => void;
}) {
	const [localSorting, setLocalSorting] = useState<SortingState>([]);
	// A caller can own the sort (e.g. to keep it in the URL); ignore sorts on
	// columns this table does not have, such as a sort carried from another tab.
	// Memoise it: a new array each render would reset the table to page one.
	const sorting = useMemo(() => {
		const columnIds = new Set(
			columns.map((column) =>
				String(
					column.id ?? ("accessorKey" in column ? column.accessorKey : ""),
				),
			),
		);
		return (controlledSorting ?? localSorting).filter((sort) =>
			columnIds.has(sort.id),
		);
	}, [columns, controlledSorting, localSorting]);
	const setSorting = (updater: Updater<SortingState>) => {
		const next = typeof updater === "function" ? updater(sorting) : updater;
		if (onSortingChange) {
			onSortingChange(next);
		} else {
			setLocalSorting(next);
		}
	};
	const paginationRef = useRef<HTMLElement>(null);
	const table = useReactTable({
		data,
		columns,
		state: { sorting },
		initialState: { pagination: { pageSize: initialPageSize } },
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		manualPagination: !paginate,
	});

	const rows = table.getRowModel().rows;
	const actionColumnWidth = renderRowActions ? 48 : 0;
	const stickyColumnWidths = [144, 64, 128, 80];
	const cellPadding = "px-3 py-2";
	const headerContentClass =
		"flex max-w-24 min-w-0 items-start gap-1 whitespace-normal leading-tight";

	function stickyLeft(columnIndex: number): number {
		return (
			actionColumnWidth +
			stickyColumnWidths
				.slice(0, columnIndex)
				.reduce((total, width) => total + width, 0)
		);
	}

	function stickyStyle(columnIndex: number): CSSProperties | undefined {
		if (columnIndex >= stickyDataColumns) {
			return undefined;
		}
		return {
			left: stickyLeft(columnIndex),
			minWidth: stickyColumnWidths[columnIndex],
			width: stickyColumnWidths[columnIndex],
		};
	}

	function stickyHeaderClass(columnIndex: number): string {
		return columnIndex < stickyDataColumns
			? "sticky z-40 bg-zinc-100 shadow-[1px_0_0_#e4e4e7]"
			: "";
	}

	function stickyBodyClass(columnIndex: number): string {
		return columnIndex < stickyDataColumns
			? "sticky z-20 shadow-[1px_0_0_#e4e4e7]"
			: "";
	}

	function returnToTable() {
		paginationRef.current?.scrollIntoView({ block: "start" });
		paginationRef.current?.focus({ preventScroll: true });
	}

	return (
		<div className="min-w-0 rounded-lg border border-zinc-200 bg-white">
			{paginate ? (
				<PaginationControls
					table={table}
					position="top"
					ref={paginationRef}
					onPageSizeChange={onPageSizeChange}
				/>
			) : null}
			<div className="overflow-x-auto rounded-lg">
				<table className="w-full min-w-max border-collapse border-spacing-0 text-sm">
					<thead className="sticky top-0 z-30 bg-zinc-100 text-left text-zinc-600">
						{table.getHeaderGroups().map((group) => (
							<tr key={group.id}>
								{renderRowActions ? (
									<th
										className={`sticky left-0 z-40 w-12 bg-zinc-100 ${cellPadding} text-center align-bottom font-medium shadow-[1px_0_0_#e4e4e7]`}
									>
										<span className="inline-flex items-center justify-center gap-1">
											<span aria-hidden="true">{rowActionsHeader}</span>
											{rowActionsHeaderTooltip ? (
												<InfoTooltip text={rowActionsHeaderTooltip} />
											) : null}
										</span>
										<span className="sr-only">{rowActionsHeaderLabel}</span>
									</th>
								) : null}
								{group.headers.map((header, columnIndex) => {
									const sorted = header.column.getIsSorted();
									const meta = header.column.columnDef.meta;
									const tooltip = meta?.tooltip;
									const numeric = meta?.numeric ?? false;
									return (
										<th
											key={header.id}
											className={`sticky top-0 z-30 ${cellPadding} align-bottom font-medium ${stickyHeaderClass(columnIndex)} ${meta?.headerClassName ?? ""}`}
											style={stickyStyle(columnIndex)}
										>
											<div
												className={`${headerContentClass}${numeric ? " ml-auto justify-end" : ""}`}
											>
												<button
													type="button"
													className={`flex min-w-0 cursor-pointer select-none items-start gap-1 ${numeric ? "text-right" : "text-left"}`}
													onClick={header.column.getToggleSortingHandler()}
												>
													<span className="min-w-0 break-words whitespace-normal">
														{flexRender(
															header.column.columnDef.header,
															header.getContext(),
														)}
													</span>
													<span className="text-zinc-400">
														{sorted === "asc"
															? "^"
															: sorted === "desc"
																? "v"
																: ""}
													</span>
												</button>
												{tooltip ? <InfoTooltip text={tooltip} /> : null}
											</div>
										</th>
									);
								})}
							</tr>
						))}
					</thead>
					<tbody>
						{rows.length === 0 ? (
							<tr>
								<td
									className="px-3 py-8 text-center text-zinc-500"
									colSpan={columns.length + (renderRowActions ? 1 : 0)}
								>
									<div className="flex flex-col items-center gap-2">
										<p className="font-medium text-zinc-700">{emptyTitle}</p>
										{emptyDescription ? (
											<p className="max-w-md text-sm text-zinc-500">
												{emptyDescription}
											</p>
										) : null}
										{emptyAction}
									</div>
								</td>
							</tr>
						) : (
							rows.map((row) => (
								<tr
									key={row.id}
									className={`group border-zinc-100 border-t ${rowClassName?.(row.original) ?? ""} hover:bg-zinc-50${
										onRowClick
											? " cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:-outline-offset-2"
											: ""
									}`}
									tabIndex={onRowClick ? 0 : undefined}
									onClick={
										onRowClick ? () => onRowClick(row.original) : undefined
									}
									onKeyDown={
										onRowClick
											? (event) => {
													// Only the focused row itself opens, so buttons inside it keep
													// their own keyboard behaviour.
													if (
														event.target === event.currentTarget &&
														(event.key === "Enter" || event.key === " ")
													) {
														event.preventDefault();
														onRowClick(row.original);
													}
												}
											: undefined
									}
								>
									{renderRowActions ? (
										<td
											className={`sticky left-0 z-30 w-12 ${cellPadding} whitespace-nowrap ${
												rowStickyClassName?.(row.original) ??
												"bg-white group-hover:bg-zinc-50"
											} shadow-[1px_0_0_#f4f4f5]`}
										>
											{renderRowActions(row.original)}
										</td>
									) : null}
									{row.getVisibleCells().map((cell, columnIndex) => {
										const meta = cell.column.columnDef.meta;
										return (
											<td
												key={cell.id}
												className={`${cellPadding} whitespace-nowrap ${meta?.numeric ? "text-right tabular-nums " : ""}${stickyBodyClass(columnIndex)} ${
													columnIndex < stickyDataColumns
														? (rowStickyClassName?.(row.original) ??
															"bg-white group-hover:bg-zinc-50")
														: ""
												}`}
												style={{
													...stickyStyle(columnIndex),
													...meta?.cellStyle?.(cell),
												}}
											>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												)}
											</td>
										);
									})}
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
			{paginate ? (
				<PaginationControls
					table={table}
					position="bottom"
					onPageSizeChange={onPageSizeChange}
					onNavigate={returnToTable}
				/>
			) : null}
		</div>
	);
}
