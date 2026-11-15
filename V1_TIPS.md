# swordfish2 v1 tip SHAs

Source branch tips combined into GitHub branch `v1` on daBiggestDuck/swordfish2.

Verified via `git fetch origin --prune` on 2026-11-14.

Base: `origin/all-merged` (`4ff3b73` = `origin/main`/`origin/v0` @ `2d1da26` + `origin/engine` @ `f75e33d`).

Then merged: `origin/story` (`89a398d`), `origin/data-missions` (`8d3c849`), plus local map/pets-3d surface polish (demos serve path, larger on-globe billboards, drop-camera focus).

| Branch | Full SHA | Short | Tip subject | Role in v1 |
|---|---|---|---|---|
| `main` | `2d1da26b74d0ac91c013ea724f2c96953eefc718` | `2d1da26` | feat(map): blit 3D instrument sprites onto Flat/South Pole pins | richest web shell / map / pets-3d tip (identical to `v0`) |
| `v0` | `2d1da26b74d0ac91c013ea724f2c96953eefc718` | `2d1da26` | feat(map): blit 3D instrument sprites onto Flat/South Pole pins | same commit as `main` |
| `all-merged` | `4ff3b736d85e0d15705e88667d5fe56c21061e67` | `4ff3b73` | Merge branch 'engine' into all-merged | v1 merge base (main + engine) |
| `engine` | `f75e33d916682d00d5d209ea19f03aad3c3cef3e` | `f75e33d` | Enhance Payload Pets Engine and Navigator | unique; merged via all-merged |
| `story` | `89a398d71f181c76bd6c5365183878287f07882f` | `89a398d` | Add story: Java-served website with four pets… | unique; merged into v1 |
| `data-missions` | `8d3c849127af1dcfb45518168e7d9ddd1f9de803` | `8d3c849` | fix(showcase): single regolith backdrop… | unique showcase polish; merged (conflict resolved) |
| `Data` | `6b45ba186ba0220043a8b1b9b9b12ad919f9597e` | `6b45ba1` | fix: use stable mission id peregrine-1 for TO2-AB payloads | ancestor of main/v0 |
| `map` | `666ecee3b9a83cd434299582d3af7a05a1d99ab0` | `666ecee` | Enhance lunar map interactions and compatibility | ancestor of main/v0 |
| `pets` | `d921b00ee2787935c19841c63e398f1c06f039bb` | `d921b00` | CreateMoonPallFile | ancestor of main/v0 |
| `ui` | `e2a0e5df9c2e49c794a9c13166a3f4baddd107af` | `e2a0e5d` | Rename project from 'swordfish2' to 'nasa space pet' | ancestor of main/v0 |
| `deployer` | `fa1d89d020eb7f89e9f80a308d2d910f7a78547b` | `fa1d89d` | Deployer dashboard: branch table, merge-into-main checks… | ancestor of main/v0 |
| `pranav/pets-triddy-nodey` | `4dd133d9168322b81b2482b12529812b74e7028a` | `4dd133d` | feat: add Triddy/Nodey pets on Data tip | ancestor of main/v0 |

Content tip (merges + map/pets polish): `058d624379698b33ef0f2c2a339a97625d6a37f1` (`058d624`). Branch HEAD may be a docs-only follow-up — prefer: `git rev-parse origin/v1`

Showcase ports: map :8080, story :8081, engine :8082 (shell :8765).

## Notes

- `main` and `v0` were identical at assemble time (`2d1da26`); no tip-only drift between them.
- Branches already fully contained in `main`/`v0` were recorded for ancestry only (no re-merge): Data, map, pets, ui, deployer, pranav/pets-triddy-nodey.
- Local uncommitted map/pets-3d polish from the staging worktree was committed on v1 after the branch merges (demos `/demos/` static serve, larger surface pet billboards, post-drop globe focus).

## Conflicts resolved

1. `web/showcase.js` (`data-missions` vs all-merged/engine) — kept data-missions Data tab moon header + LRO/regolith assets; retained main/v0 judge-path kicker and four-adoptable-pet wording (TRIDENT stays a payload, not an adoptable pet). Auto-merged `web/showcase.css` and new assets without further conflict.
