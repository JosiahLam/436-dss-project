"""Module 2 -- the dividend-cut classifier.

Two models, per the locked decision:
  * primary  -- HistGradientBoosting (sklearn's gradient booster; no native
                dep on libomp, swap in XGBoost/LightGBM later if desired).
  * baseline -- LogisticRegression (interpretable, also the calibration check).

We evaluate with a *time-based* split (train <= 2021, test >= 2022, per the
proposal) and report three numbers the monitoring plan asks for: the model's
test AUC, the baseline AUC, and the AUC of the dumb rule "flag any ETF whose
payout has been declining" -- the model has to beat that to earn its keep.
We also report the precision of the Risky flag (of those we call Risky, what
fraction actually cut).

If the data is too thin or single-class to train (can happen with very small
real universes), we fall back to a transparent rule-based scorer so the
pipeline still produces sensible risk scores.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_score, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .. import config
from ..features.build_features import FEATURE_COLUMNS


class RuleScorer:
    """Fallback: squashes the (negated) payout trend into a pseudo-probability.

    A steeply falling payout -> high cut probability. Used only when there is
    not enough labelled data to fit a real model.
    """

    def fit(self, X, y=None):
        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        trend = X["payout_trend"].fillna(0.0).to_numpy()
        ever = X["ever_cut"].fillna(0.0).to_numpy()
        z = -8.0 * trend + 0.6 * ever - 0.4
        p = 1.0 / (1.0 + np.exp(-z))
        return np.column_stack([1.0 - p, p])


def _build_models():
    primary = HistGradientBoostingClassifier(
        max_depth=3, learning_rate=0.08, max_iter=300,
        l2_regularization=1.0, min_samples_leaf=15, random_state=0,
    )
    baseline = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale", StandardScaler()),
        ("lr", LogisticRegression(class_weight="balanced", max_iter=1000)),
    ])
    return primary, baseline


def _safe_auc(model, X_fit, y_fit, X_eval, y_eval) -> float | None:
    if len(y_fit) < 20 or len(y_eval) < 5:
        return None
    if y_fit.nunique() < 2 or y_eval.nunique() < 2:
        return None
    try:
        model.fit(X_fit, y_fit)
        return float(roc_auc_score(y_eval, model.predict_proba(X_eval)[:, 1]))
    except Exception:
        return None


def train(X: pd.DataFrame, y: pd.Series, dates: pd.DatetimeIndex) -> dict:
    primary, baseline = _build_models()

    # Single-class data -> rule-based fallback.
    if y.nunique() < 2:
        scorer = RuleScorer().fit(X, y)
        return {
            "primary": scorer, "baseline": scorer,
            "metrics": {"model_auc": None, "baseline_auc": None,
                        "rule_auc": None, "risky_precision": None},
            "fallback": True,
        }

    train_mask = np.asarray(dates.year <= config.TRAIN_END_YEAR)
    test_mask = np.asarray(dates.year >= config.TEST_START_YEAR)
    Xtr, ytr = X[train_mask], y[train_mask]
    Xte, yte = X[test_mask], y[test_mask]

    model_auc = _safe_auc(clone(primary), Xtr, ytr, Xte, yte)
    baseline_auc = _safe_auc(clone(baseline), Xtr, ytr, Xte, yte)

    # Dumb-rule benchmark: more-negative payout trend -> riskier.
    rule_auc = None
    if test_mask.sum() >= 5 and yte.nunique() == 2:
        try:
            rule_auc = float(roc_auc_score(yte, (-Xte["payout_trend"]).fillna(0.0)))
        except Exception:
            rule_auc = None

    # Precision of the Risky flag on the test fold.
    risky_precision = None
    if model_auc is not None:
        m = clone(primary).fit(Xtr, ytr)
        flagged = m.predict_proba(Xte)[:, 1] >= config.RISKY_MIN
        if flagged.sum() > 0:
            risky_precision = float(precision_score(yte, flagged, zero_division=0))

    # Final fit on ALL available data -> used for live scoring.
    primary.fit(X, y)
    baseline.fit(X, y)

    return {
        "primary": primary,
        "baseline": baseline,
        "metrics": {
            "model_auc": model_auc,
            "baseline_auc": baseline_auc,
            "rule_auc": rule_auc,
            "risky_precision": risky_precision,
        },
        "fallback": False,
    }
