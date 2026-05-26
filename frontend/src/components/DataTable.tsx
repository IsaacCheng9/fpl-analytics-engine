import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type RowData,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import { InfoTooltip } from "./InfoTooltip";

declare module "@tanstack/react-table" {
	// A tooltip explaining what a column means.
	interface ColumnMeta<TData extends RowData, TValue> {
		tooltip?: string;
		headerClassName?: string;
	}
}

export function DataTable<T>({
	data,
	columns,
	onRowClick,
}: {
	data: T[];
	columns: ColumnDef<T>[];
	onRowClick?: (row: T) => void;
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

	return (
		<div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
			<table className="w-full text-sm">
				<thead className="bg-zinc-100 text-left text-zinc-600">
					{table.getHeaderGroups().map((group) => (
						<tr key={group.id}>
							{group.headers.map((header) => {
								const sorted = header.column.getIsSorted();
								const meta = header.column.columnDef.meta;
								const tooltip = meta?.tooltip;
								return (
									<th
										key={header.id}
										className={`px-3 py-2 align-bottom font-medium ${meta?.headerClassName ?? ""}`}
									>
										<div className="flex w-full items-end gap-1">
											<button
												type="button"
												className="flex cursor-pointer select-none items-end gap-1 text-left"
												onClick={header.column.getToggleSortingHandler()}
											>
												<span>
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
								className="px-3 py-6 text-center text-zinc-400"
								colSpan={columns.length}
							>
								No players match.
							</td>
						</tr>
					) : (
						rows.map((row) => (
							<tr
								key={row.id}
								className={`border-zinc-100 border-t hover:bg-zinc-50${
									onRowClick ? " cursor-pointer" : ""
								}`}
								onClick={
									onRowClick ? () => onRowClick(row.original) : undefined
								}
							>
								{row.getVisibleCells().map((cell) => (
									<td key={cell.id} className="px-3 py-2 whitespace-nowrap">
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</td>
								))}
							</tr>
						))
					)}
				</tbody>
			</table>
		</div>
	);
}
