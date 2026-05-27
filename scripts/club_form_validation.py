"""Run club-form plus FDR validation against local archived data."""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from pathlib import Path

from fpl_analytics_engine import club, data


def _format_pct(value: float | None) -> str:
    """Format a nullable proportion as a percentage."""
    return "n/a" if value is None else f"{value * 100:.1f}%"


def _format_num(value: float | None) -> str:
    """Format a nullable float."""
    return "n/a" if value is None else f"{value:.3f}"


def main(argv: Sequence[str] | None = None) -> int:
    """Run the club-form validation script."""
    parser = argparse.ArgumentParser(
        description=(
            "Backtest whether club form improves an FDR-only baseline against "
            "future club xG and xGC."
        ),
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("data") / "2025-26",
        help="Season directory containing enriched player history and fixtures.",
    )
    parser.add_argument(
        "--window",
        type=int,
        default=club.DEFAULT_WINDOW,
        help="Recent club-match window used for form.",
    )
    parser.add_argument(
        "--fdr-horizon",
        type=int,
        default=5,
        help="Future gameweek horizon used for FDR and realised outcomes.",
    )
    parser.add_argument(
        "--min-train-rows",
        type=int,
        default=club.DEFAULT_VALIDATION_MIN_TRAIN_ROWS,
        help="Minimum prior club/GW rows before scoring an as-of gameweek.",
    )
    args = parser.parse_args(argv)

    history = data.prepare_history(args.data_dir)
    fixtures_data = data.load_fixtures(args.data_dir)
    scored = club.backtest_club_form_signals(
        history,
        fixtures_data,
        window=args.window,
        fdr_horizon=args.fdr_horizon,
        min_train_rows=args.min_train_rows,
    )
    summary = club.summarise_club_form_validation(scored)
    if summary.is_empty():
        print("[WARN] No club-form validation rows were scored.")
        return 0

    for row in summary.to_dicts():
        print(
            "[OK] "
            f"{row['target']}: "
            f"n={row['n_predictions']}, "
            f"FDR MAE={_format_num(row['fdr_mae'])}, "
            f"FDR+form MAE={_format_num(row['fdr_plus_form_mae'])}, "
            f"MAE improvement={_format_num(row['mae_improvement'])} "
            f"({_format_pct(row['mae_improvement_pct'])}), "
            f"FDR RMSE={_format_num(row['fdr_rmse'])}, "
            f"FDR+form RMSE={_format_num(row['fdr_plus_form_rmse'])}, "
            f"RMSE improvement={_format_num(row['rmse_improvement'])} "
            f"({_format_pct(row['rmse_improvement_pct'])})"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
