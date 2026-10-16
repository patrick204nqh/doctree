---
status: active
owner: platform team
next: docs/architecture.md
---

# Orders service

A small demo folder for trying Doctree. Open this folder with **Open Folder** and click through the tree.

## What is in here

| Path | What it shows |
|------|---------------|
| [docs/architecture.md](docs/architecture.md) | A Mermaid diagram and a task list |
| [data/orders.json](data/orders.json) | The JSON tree view |
| [data/sales.csv](data/sales.csv) | A CSV table with a sticky header |
| [src/server.py](src/server.py) | Source with syntax highlighting |
| [report.html](report.html) | An HTML file in a sandboxed frame |

## Checklist

- [x] Read-only: Doctree never changes this folder
- [x] Front matter shows as chips above
- [ ] Press `Cmd K` (or `Ctrl K`) to jump to any file

## A code block

```python
def total(orders):
    """Sum the paid orders."""
    return sum(o["amount"] for o in orders if o["paid"])
```
