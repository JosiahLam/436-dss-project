"""CLI for the monthly batch job.

    python -m scripts.run_pipeline            # live Yahoo Finance data
    python -m scripts.run_pipeline --synthetic  # offline deterministic data
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.pipeline import run_pipeline  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Perch scoring pipeline.")
    parser.add_argument("--synthetic", action="store_true",
                        help="Use deterministic synthetic data instead of Yahoo Finance.")
    args = parser.parse_args()

    summary = run_pipeline(force_synthetic=args.synthetic)
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
