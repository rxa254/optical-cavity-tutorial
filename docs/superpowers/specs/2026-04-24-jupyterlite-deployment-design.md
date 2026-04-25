# JupyterLite GitHub Pages Deployment — Design Spec
**Date:** 2026-04-24  
**Scope:** Convert `cavity_designer.ipynb` from matplotlib/ipympl to Plotly, deploy as JupyterLite static site on GitHub Pages via GitHub Actions.

---

## 1. Goals

- Zero-install URL: students open a link and interact immediately, no Python environment needed.
- Code hidden by default (collapsed input cells); expandable for curious readers.
- Physics modules (`src/`) untouched — only notebook widget cells change.
- Automated deployment: every push to `main` rebuilds and publishes the site.

---

## 2. Plotting conversion

### 2.1 Motivation

`%matplotlib widget` (ipympl) requires a WebSocket connection to a live Python kernel. JupyterLite runs Python via Pyodide (WebAssembly) with no WebSocket kernel, so ipympl cannot function. Plotly `FigureWidget` is browser-native and works in Pyodide.

### 2.2 Setup cell changes

Remove:
```python
%matplotlib widget
```

Add:
```python
import plotly.graph_objects as go
from plotly.subplots import make_subplots
```

Remove `import matplotlib.pyplot as plt` and `ipympl` from `requirements.txt`.

### 2.3 Update callback pattern

**Before (ipympl):**
```python
def _update(_=None):
    ax.clear()
    ax.semilogy(x, y, color='...')
    ax.set_xlabel('...')
    fig.canvas.draw_idle()
```

**After (Plotly FigureWidget):**
```python
def _update(_=None):
    # compute x, y as before
    with fig.batch_update():
        fig.data[0].x = x
        fig.data[0].y = y
```

Figures are constructed once with empty/placeholder traces; `_update()` only swaps data. Layout (axis labels, titles, ranges) is set at construction time and not touched in the callback.

### 2.4 Per-section conversions

| Section | Panels | Plotly types |
|---------|--------|-------------|
| §2 Cavity basics | 2 (intracavity + reflected) | `go.Scatter` × 2, `yaxis_type='log'` |
| §3 left — stability diagram | 1 (g1–g2 plane) | `go.Contour` (shaded region) + `go.Scatter` (operating point + special points) |
| §3 right — beam caustic | 1 | `go.Scatter` with `fill='tonexty'` for beam envelope; `go.Scatter` for mirror lines |
| §5 PDH locking | 4 (2×2) | `make_subplots(2,2)` FigureWidget; `go.Scatter` each panel; panel D uses `go.Bar` |
| §6 HOM transfer function | 1 | `go.Scatter` with `fill='tozeroy'`, `yaxis_type='log'`; `go.Scatter` for sideband vlines |
| §7 radar | 1 | `go.Scatterpolar` |
| §7 bar | 1 | `go.Bar` |

### 2.5 Annotations

Plotly annotations via `fig.add_annotation(x=..., y=..., text=..., showarrow=False)` at figure construction. For dynamic annotations (e.g., waist label position changes with ROC), update via `fig.layout.annotations[i].x = new_x` inside `batch_update`.

### 2.6 Color mapping

Keep existing color semantics; map to Plotly-compatible color strings:

| Role | Current | Plotly |
|------|---------|--------|
| Carrier / TEM00 | `xkcd:cerulean` | `'steelblue'` |
| Sidebands | `xkcd:orange` | `'darkorange'` |
| HOMs | `xkcd:green` | `'seagreen'` |
| Reflected power | `xkcd:scarlet` | `'crimson'` |
| Radar fill | `xkcd:cerulean` | `'steelblue'` |

### 2.7 Cell visibility

After all plot conversions, run a one-time script to set `"source_hidden": true` in every code cell's metadata:

```python
import json, pathlib
nb = json.loads(pathlib.Path("cavity_designer.ipynb").read_text())
for cell in nb["cells"]:
    if cell["cell_type"] == "code":
        cell.setdefault("metadata", {}).setdefault("jupyter", {})["source_hidden"] = True
pathlib.Path("cavity_designer.ipynb").write_text(json.dumps(nb, indent=1))
```

Markdown cells are unchanged and fully visible.

---

## 3. JupyterLite build and GitHub Pages

### 3.1 New files

```
.github/workflows/deploy.yml   # CI/CD pipeline
jupyterlite_config.json        # build config
```

### 3.2 `jupyterlite_config.json`

```json
{
  "LiteBuildConfig": {
    "contents": ["cavity_designer.ipynb", "src/"]
  }
}
```

### 3.3 `.github/workflows/deploy.yml`

```yaml
name: Deploy JupyterLite to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install JupyterLite
        run: pip install jupyterlite-core jupyterlite-pyodide-kernel

      - name: Build JupyterLite site
        run: jupyter lite build --output-dir _output

      - name: Deploy to gh-pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./_output
          publish_branch: gh-pages
```

### 3.4 `requirements.txt` changes

Remove: `ipympl>=0.9`  
Add: `plotly>=5.0`

Pyodide ships `numpy`, `scipy`, `plotly`, and `ipywidgets` as pre-built wheels — no additional configuration needed for these packages.

### 3.5 Manual step (one-time, done by user)

In the GitHub repo: Settings → Pages → Source → Deploy from branch → `gh-pages` / `/ (root)`.

After the first Actions run succeeds the site is live at:  
`https://<username>.github.io/<repo-name>/`

---

## 4. Files changed

| File | Action |
|------|--------|
| `cavity_designer.ipynb` | Replace all matplotlib/ipympl plots with Plotly FigureWidget; collapse code cells |
| `requirements.txt` | Remove `ipympl`, add `plotly>=5.0` |
| `jupyterlite_config.json` | Create |
| `.github/workflows/deploy.yml` | Create |
| `CHANGELOG.md` | Session entry |

### Out of scope
- No changes to `src/` modules
- No changes to ipywidgets sliders/dropdowns/VBox/HBox
- No sympy dependency (not currently used in the notebook)
- No Voilà, no Panel, no Streamlit
