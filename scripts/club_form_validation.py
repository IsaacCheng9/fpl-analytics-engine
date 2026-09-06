"""Run point-in-time club-form validation against local archived data."""

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
            "Backtest whether recent club form improves a season-to-date "
            "baseline against future club xG and xGC."
        ),
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("data") / "2025-26",
        help="Season directory containing raw player and fixture history.",
    )
    parser.add_argument(
        "--window",
        type=int,
        default=club.DEFAULT_WINDOW,
        help="Recent gameweek window used for form, including double fixtures.",
    )
    parser.add_argument(
        "--horizon",
        type=int,
        default=5,
        help="Future gameweek horizon used for realised outcomes.",
    )
    parser.add_argument(
        "--min-train-rows",
        type=int,
        default=club.DEFAULT_VALIDATION_MIN_TRAIN_ROWS,
        help="Minimum prior club/GW rows before scoring an as-of gameweek.",
    )
    args = parser.parse_args(argv)

    history = data.prepare_history(args.data_dir)
    scored = club.backtest_club_form_signals(
        history,
        window=args.window,
        horizon=args.horizon,
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
            f"baseline MAE={_format_num(row['baseline_mae'])}, "
            "baseline+form MAE="
            f"{_format_num(row['baseline_plus_form_mae'])}, "
            f"MAE improvement={_format_num(row['mae_improvement'])} "
            f"({_format_pct(row['mae_improvement_pct'])}), "
            f"baseline RMSE={_format_num(row['baseline_rmse'])}, "
            "baseline+form RMSE="
            f"{_format_num(row['baseline_plus_form_rmse'])}, "
            f"RMSE improvement={_format_num(row['rmse_improvement'])} "
            f"({_format_pct(row['rmse_improvement_pct'])})"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
