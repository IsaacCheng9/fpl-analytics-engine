import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";

export function DataTable<T>({
	data,
	columns,
}: {
	data: T[];
	columns: ColumnDef<T>[];
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
								return (
									<th
										key={header.id}
										className="px-3 py-2 align-bottom font-medium"
									>
										<button
											type="button"
											className="flex w-full cursor-pointer select-none items-end gap-1 text-left"
											onClick={header.column.getToggleSortingHandler()}
										>
											<span>
												{flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
											</span>
											<span className="text-zinc-400">
												{sorted === "asc" ? "^" : sorted === "desc" ? "v" : ""}
											</span>
										</button>
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
								className="border-zinc-100 border-t hover:bg-zinc-50"
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
