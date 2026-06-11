# Screenshots

Drop three PNG files in this folder. The root `README.md` references them by exact filename:

| Filename | What to capture | How |
|---|---|---|
| `mobile-ui.png` | The swap UI at a mobile width | Open the [live demo](https://frontend-safalyadeb1.vercel.app) → Chrome DevTools → toggle device toolbar (`Cmd/Ctrl+Shift+M`) → pick **iPhone 14 Pro** → screenshot the Swap page |
| `ci-pipeline.png` | The GitHub Actions run, green | Go to the repo's **Actions** tab → open the latest **Test Suite** run → screenshot the jobs list (all checks passing) |
| `tests-passing.png` | Terminal showing 3+ passing tests | Run any test layer and screenshot the summary, e.g. `cd frontend && npm test` (27 passed) or `cargo test --workspace` (59 passed) |

Recommended width: ~1200px. PNG preferred. Once added, the screenshots section of the root README renders automatically.
