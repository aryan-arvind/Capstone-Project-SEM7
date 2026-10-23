#!/usr/bin/env python3
"""Figures and tables for the paper, from results/results.json (written by msme/run.mjs).

    python scripts/plots.py                          # reads results/results.json, writes results/figures + results/tables.*
    python scripts/plots.py --in other/results.json --out other/

Only numpy and matplotlib are needed. Means and 95% intervals come from the JSON `summary` (computed
once, in msme/stats.mjs, with t-intervals); distributions come from the per-episode rows.
"""
import argparse
import json
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

STRATS = ["independent", "priority_vote", "constraint_aware"]
LABEL = {"independent": "No arbiter", "priority_vote": "Priority vote", "constraint_aware": "Constraint-aware Arbiter"}
COLOUR = {"independent": "#8c8c8c", "priority_vote": "#e69f00", "constraint_aware": "#0072b2"}
SCEN_LABEL = {
    "baseline": "Baseline",
    "delayed_receivable": "Delayed\nreceivable",
    "supplier_price_spike": "Supplier\nprice spike",
    "demand_surge": "Demand\nsurge",
    "credit_limit_tightened": "Credit limit\ntightened",
}
METRICS = [
    ("violation_rate", "Constraint-violation rate (share of weeks)", "{:.3f}"),
    ("min_cash_inr", "Minimum cash (Rs)", "{:,.0f}"),
    ("stockout_units", "Stock-out units", "{:,.0f}"),
    ("ccc_days", "Cash conversion cycle (days)", "{:.1f}"),
    ("ending_cash_inr", "Ending cash (Rs)", "{:,.0f}"),
    ("ending_net_worth_inr", "Ending net worth (Rs)", "{:,.0f}"),
    ("profit_inr", "Operating profit (Rs)", "{:,.0f}"),
]


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def summ(res, scenario, strategy, metric):
    for s in res["summary"]:
        if s["scenario"] == scenario and s["strategy"] == strategy:
            return s[metric]
    return None


def bars(res, metric, ylabel, fname, outdir, scenarios, strategies, title):
    fig, ax = plt.subplots(figsize=(9, 4.2))
    w = 0.8 / len(strategies)
    for j, st in enumerate(strategies):
        means, lo, hi = [], [], []
        for sc in scenarios:
            s = summ(res, sc, st, metric)
            means.append(s["mean"]); lo.append(s["mean"] - s["ci95"][0]); hi.append(s["ci95"][1] - s["mean"])
        x = np.arange(len(scenarios)) + (j - (len(strategies) - 1) / 2) * w
        ax.bar(x, means, w, yerr=[lo, hi], capsize=3, color=COLOUR[st], label=LABEL[st], edgecolor="white", linewidth=0.6)
    ax.set_xticks(np.arange(len(scenarios)))
    ax.set_xticklabels([SCEN_LABEL.get(s, s) for s in scenarios])
    ax.set_ylabel(ylabel)
    ax.set_title(title, loc="left", fontsize=11)
    ax.axhline(0, color="black", linewidth=0.6)
    ax.legend(frameon=False, fontsize=8)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(os.path.join(outdir, fname), dpi=200)
    plt.close(fig)


def boxes(res, metric, ylabel, fname, outdir, scenarios, strategies, title):
    rows = res["rows"]
    fig, ax = plt.subplots(figsize=(9, 4.2))
    w = 0.8 / len(strategies)
    for j, st in enumerate(strategies):
        data = [[r[metric] for r in rows if r["scenario"] == sc and r["strategy"] == st] for sc in scenarios]
        pos = np.arange(len(scenarios)) + (j - (len(strategies) - 1) / 2) * w
        bp = ax.boxplot(data, positions=pos, widths=w * 0.85, patch_artist=True, showfliers=False)
        for b in bp["boxes"]:
            b.set(facecolor=COLOUR[st], alpha=0.85, edgecolor="#333333")
        for m in bp["medians"]:
            m.set(color="black")
        ax.plot([], [], color=COLOUR[st], linewidth=8, label=LABEL[st])
    ax.set_xticks(np.arange(len(scenarios)))
    ax.set_xticklabels([SCEN_LABEL.get(s, s) for s in scenarios])
    ax.set_ylabel(ylabel)
    ax.set_title(title, loc="left", fontsize=11)
    ax.axhline(res["meta"]["params"]["constraints"]["min_cash_buffer"], color="#c0392b", linestyle="--", linewidth=1)
    ax.text(0.01, res["meta"]["params"]["constraints"]["min_cash_buffer"], " minimum cash buffer", color="#c0392b", fontsize=8, va="bottom", transform=ax.get_yaxis_transform())
    ax.legend(frameon=False, fontsize=8, loc="lower right")
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(os.path.join(outdir, fname), dpi=200)
    plt.close(fig)


def tradeoff(res, outdir, scenarios, strategies):
    fig, ax = plt.subplots(figsize=(6.5, 4.6))
    markers = ["o", "s", "^", "D", "P"]
    for si, sc in enumerate(scenarios):
        for st in strategies:
            p = summ(res, sc, st, "profit_inr")["mean"]
            v = summ(res, sc, st, "violation_rate")["mean"]
            ax.scatter(p, v, color=COLOUR[st], marker=markers[si % 5], s=60, edgecolor="white", linewidth=0.6)
    for st in strategies:
        ax.scatter([], [], color=COLOUR[st], label=LABEL[st], s=60)
    for si, sc in enumerate(scenarios):
        ax.scatter([], [], color="#555555", marker=markers[si % 5], label=SCEN_LABEL.get(sc, sc).replace("\n", " "), s=40)
    ax.set_xlabel("Mean operating profit over the episode (Rs)")
    ax.set_ylabel("Mean constraint-violation rate")
    ax.set_title("What constraint-awareness costs", loc="left", fontsize=11)
    ax.legend(frameon=False, fontsize=7, ncol=2)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(os.path.join(outdir, "fig4_tradeoff.png"), dpi=200)
    plt.close(fig)


def trajectories(res, outdir, scenarios, strategies):
    weekly = res["weekly"]
    fig, axes = plt.subplots(1, len(scenarios), figsize=(3.1 * len(scenarios), 3.4), sharey=True)
    axes = np.atleast_1d(axes)
    buf = res["meta"]["params"]["constraints"]["min_cash_buffer"]
    for ax, sc in zip(axes, scenarios):
        for st in strategies:
            ws = [w for w in weekly if w["scenario"] == sc and w["strategy"] == st]
            nweeks = max(w["week"] for w in ws) + 1
            mat = np.array([[w["cash"] for w in ws if w["week"] == k] for k in range(nweeks)], dtype=float)
            med, q1, q3 = np.median(mat, axis=1), np.percentile(mat, 25, axis=1), np.percentile(mat, 75, axis=1)
            x = np.arange(1, nweeks + 1)
            ax.plot(x, med, color=COLOUR[st], label=LABEL[st], linewidth=1.8)
            ax.fill_between(x, q1, q3, color=COLOUR[st], alpha=0.15, linewidth=0)
        ax.axhline(buf, color="#c0392b", linestyle="--", linewidth=0.9)
        ax.axhline(0, color="black", linewidth=0.5)
        ax.set_title(SCEN_LABEL.get(sc, sc).replace("\n", " "), fontsize=9)
        ax.set_xlabel("Week")
        ax.set_xticks(range(2, nweeks + 1, 2))
        ax.spines[["top", "right"]].set_visible(False)
    axes[0].set_ylabel("Cash at week end (Rs), median and IQR")
    axes[0].legend(frameon=False, fontsize=7, loc="upper left")
    fig.tight_layout()
    fig.savefig(os.path.join(outdir, "fig5_cash_trajectories.png"), dpi=200)
    plt.close(fig)


def fmt(metric_fmt, s):
    m = metric_fmt.format(s["mean"])
    h = (s["ci95"][1] - s["ci95"][0]) / 2
    return f"{m} ± {metric_fmt.format(h)}"


def tables(res, outdir, scenarios, strategies):
    n = res["meta"]["seeds"]
    md = [f"# Results ({n} seeds per cell, {res['meta']['episode_weeks']}-week episodes, proposals: {res['meta']['mode']})", ""]
    tex = []
    md.append("## Table 1. Mean ± half-width of the 95% interval")
    for key, name, mf in METRICS:
        md += ["", f"**{name}**", "", "| Scenario | " + " | ".join(LABEL[s] for s in strategies) + " |", "|---|" + "---|" * len(strategies)]
        tex.append(f"% {name}")
        tex.append("\\begin{tabular}{l" + "r" * len(strategies) + "}\\hline")
        tex.append("Scenario & " + " & ".join(LABEL[s] for s in strategies) + " \\\\ \\hline")
        for sc in scenarios:
            cells = [fmt(mf, summ(res, sc, st, key)) for st in strategies]
            md.append(f"| {SCEN_LABEL.get(sc, sc).replace(chr(10), ' ')} | " + " | ".join(cells) + " |")
            tex.append(SCEN_LABEL.get(sc, sc).replace("\n", " ") + " & " + " & ".join(c.replace("±", "$\\pm$").replace(",", "{,}") for c in cells) + " \\\\")
        tex.append("\\hline\\end{tabular}\n")
    md += ["", "## Table 2. Paired difference, constraint-aware Arbiter minus baseline (same seeds)", "",
           "Negative is better for violation rate, stock-outs and CCC; positive is better for cash, net worth and profit. 'wins' counts seeds where the Arbiter's value is lower.", ""]
    for base in [s for s in strategies if s != "constraint_aware"]:
        md += [f"**vs {LABEL[base]}**", "", "| Scenario | " + " | ".join(m[1] for m in METRICS[:7]) + " |", "|---|" + "---|" * 7]
        for sc in scenarios:
            comp = res["comparisons"][sc][base]
            cells = []
            for key, _, mf in METRICS[:7]:
                c = comp[key]
                lo, hi = c["ci95"]
                sig = "*" if (lo > 0 or hi < 0) else ""
                cells.append(f"{mf.format(c['mean'])}{sig} (wins {c['wins_a']}/{c['pairs']})")
            md.append(f"| {SCEN_LABEL.get(sc, sc).replace(chr(10), ' ')} | " + " | ".join(cells) + " |")
        md.append("")
    md.append("`*` the 95% interval of the paired difference excludes zero.")
    with open(os.path.join(outdir, "tables.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(md) + "\n")
    with open(os.path.join(outdir, "tables.tex"), "w", encoding="utf-8") as f:
        f.write("\n".join(tex) + "\n")


def main():
    ap = argparse.ArgumentParser()
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
    ap.add_argument("--in", dest="inp", default=os.path.join(root, "results.json"))
    ap.add_argument("--out", default=os.path.dirname(os.path.abspath(os.path.join(root, "results.json"))))
    a = ap.parse_args()
    res = load(a.inp)
    out = a.out if a.out != os.path.dirname(os.path.abspath(os.path.join(root, "results.json"))) or a.inp == os.path.join(root, "results.json") else os.path.dirname(os.path.abspath(a.inp))
    figs = os.path.join(out, "figures")
    os.makedirs(figs, exist_ok=True)
    scenarios = [s for s in res["meta"]["scenarios"]]
    strategies = [s for s in STRATS if s in res["meta"]["strategies"]]
    bars(res, "violation_rate", "Share of weeks with a violation", "fig1_violation_rate.png", figs, scenarios, strategies, "Constraint-violation rate (realised books), mean and 95% CI")
    boxes(res, "min_cash_inr", "Lowest week-end cash (Rs)", "fig2_min_cash.png", figs, scenarios, strategies, "Minimum cash over the episode")
    bars(res, "stockout_units", "Units of unmet demand", "fig3_stockouts.png", figs, scenarios, strategies, "Stock-out units, mean and 95% CI")
    tradeoff(res, figs, scenarios, strategies)
    trajectories(res, figs, scenarios, strategies)
    bars(res, "ending_net_worth_inr", "Rs", "fig6_net_worth.png", figs, scenarios, strategies, "Ending net worth, mean and 95% CI")
    bars(res, "ccc_days", "Days", "fig7_ccc.png", figs, scenarios, strategies, "Cash conversion cycle, mean and 95% CI")
    tables(res, out, scenarios, strategies)
    print(f"wrote {len(os.listdir(figs))} figures to {figs} and tables.md / tables.tex to {out}")


if __name__ == "__main__":
    main()
