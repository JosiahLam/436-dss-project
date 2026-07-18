import sys, warnings
import numpy as np, pandas as pd
from sklearn.metrics import roc_auc_score, average_precision_score
warnings.filterwarnings("ignore")
MB="/tmp/claude-0/-home-user-436-dss-project/4d7c5e2f-9c58-5086-b824-38c295efcbe2/scratchpad/mlbench"
sys.path[:0]=[MB]
import bakeoff as B, label_v2 as L, features_v2 as F

raw = L.load_raw()
feats = F.build_feature_panel(raw)                       # v2 features
lab = L.label_panel(raw, thr=0.10, fwd=12, mode="ttm")   # v2 label
master = feats.merge(lab[["ticker","date","label"]], on=["ticker","date"], how="left")
master = master.rename(columns={"label":"label_new"})
master["date"] = pd.to_datetime(master["date"])
master["year"] = master["date"].dt.year

ALL = F.FEATURE_COLUMNS_V2
G = {
 "payout":  ["payout_trend_6","payout_trend_12","payout_trend_24","rr_drawdown_24","rr_decline_months","payout_cv"],
 "price":   ["ret_6","ret_12","ret_vol_12","price_drawdown_24"],
 "yield":   ["ttm_yield","yield_z_36","yield_vs_cat"],
 "history": ["ever_cut","months_since_cut","age_log"],
 "cats":    [c for c in ALL if c.startswith("cat_")],
}
COMPACT8 = ["ttm_yield","yield_z_36","yield_vs_cat","price_drawdown_24","ret_12","ret_vol_12","payout_trend_12","payout_cv"]
configs = {"all_20": ALL, "compact_8": COMPACT8}
for g in G: configs[f"drop_{g}"] = [c for c in ALL if c not in G[g]]

def run(cols):
    rocs, prs = [], []
    for Y in B.TRAIN_END_YEARS:
        train_cut = pd.Timestamp(Y,12,31) - pd.DateOffset(months=12)
        tr = master[(master["date"]<=train_cut) & master["label_new"].notna()]
        if tr["label_new"].nunique()<2 or tr["label_new"].sum()<3: continue
        idx = B.dedup_eval_index(master, "label_new", Y+1)
        te = master.loc[idx]; te = te[te["label_new"].notna()]
        if len(te)==0 or te["label_new"].nunique()<2: continue
        s = B.fit_predict("CatBoost", tr[cols], tr["label_new"].values, tr["date"], te[cols])
        y = te["label_new"].values.astype(int)
        rocs.append(roc_auc_score(y,s)); prs.append(average_precision_score(y,s))
    return np.mean(rocs), np.std(rocs), np.mean(prs), np.std(prs)

print(f"{'config':<14}{'nfeat':>6}{'ROC':>8}{'±':>7}{'PR':>8}{'±':>7}")
for name, cols in configs.items():
    r,rs,p,ps = run(cols)
    print(f"{name:<14}{len(cols):>6}{r:>8.3f}{rs:>7.3f}{p:>8.3f}{ps:>7.3f}")
