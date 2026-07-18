"""Tax-advantaged account allocation feature (asset location).

Self-contained and feature-flagged (``config.TAX_FEATURES_ENABLED``) so the
whole thing can be turned off at runtime or removed by deleting this package —
the team has not finalized the tax methodology yet.
"""
from .allocation import allocate_accounts

__all__ = ["allocate_accounts"]
