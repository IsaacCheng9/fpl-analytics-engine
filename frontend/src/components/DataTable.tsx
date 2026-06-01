import {
	type Cell,
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type RowData,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { type CSSProperties, type ReactNode, useState } from "react";
import { InfoTooltip } from "./InfoTooltip";

declare module "@tanstack/react-table" {
	// A tooltip explaining what a column means.
	interface ColumnMeta<TData extends RowData, TValue> {
		tooltip?: string;
		headerClassName?: string;
		cellStyle?: (cell: Cell<TData, TValue>) => CSSProperties | undefined;
	}
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
}) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const table = useReactTable({
		data,
		columns,
		state: { sorting },
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
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

	return (
		<div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
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
								return (
									<th
										key={header.id}
										className={`sticky top-0 z-30 ${cellPadding} align-bottom font-medium ${stickyHeaderClass(columnIndex)} ${meta?.headerClassName ?? ""}`}
										style={stickyStyle(columnIndex)}
									>
										<div className={headerContentClass}>
											<button
												type="button"
												className="flex min-w-0 cursor-pointer select-none items-start gap-1 text-left"
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
									onRowClick ? " cursor-pointer" : ""
								}`}
								onClick={
									onRowClick ? () => onRowClick(row.original) : undefined
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
											className={`${cellPadding} whitespace-nowrap ${stickyBodyClass(columnIndex)} ${
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
	);
}
