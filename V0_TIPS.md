# swordfish2 `v0` tip SHAs

Assembled tip document for branch `v0` @ `336079a41360195b6405ea280815742a74de0350` (`336079a`).

Verified via `git fetch origin --prune` + `gh api repos/daBiggestDuck/swordfish2/branches`.

| Branch | Full SHA | Short | Tip subject |
|---|---|---|---|
| `main` | `e2a0e5df9c2e49c794a9c13166a3f4baddd107af` | `e2a0e5d` | Rename project from 'swordfish2' to 'nasa space pet' |
| `Data` | `6b45ba186ba0220043a8b1b9b9b12ad919f9597e` | `6b45ba1` | fix: use stable mission id peregrine-1 for TO2-AB payloads |
| `engine` | `7c5db21ad61c18b7b4021cd9623ecd2716124aa0` | `7c5db21` | Rebuild engine in Java with real CLPS data and a local web page |
| `map` | `666ecee3b9a83cd434299582d3af7a05a1d99ab0` | `666ecee` | Enhance lunar map interactions and compatibility |
| `story` | `12e20f68cd13f33f31085b61897d82faf2ec3dac` | `12e20f6` | Add story: Java-served website with pets, mission pop-ups, Pet Passport and Sun/Earth view |
| `pets` | `d921b00ee2787935c19841c63e398f1c06f039bb` | `d921b00` | CreateMoonPallFile |
| `ui` | `e2a0e5df9c2e49c794a9c13166a3f4baddd107af` | `e2a0e5d` | Rename project from 'swordfish2' to 'nasa space pet' |
| `pranav/pets-triddy-nodey` | `4dd133d9168322b81b2482b12529812b74e7028a` | `4dd133d` | feat: add Triddy/Nodey pets on Data tip |
| `deployer` | `4a42a15d210a8c7fab218a05428c3ac5badd9eca` | `4a42a15` | Add public link feature with password protection and enhance dashboard routing |

| `v0` (this branch) | `336079a41360195b6405ea280815742a74de0350` | `336079a` | assembled showcase |

## Notes

- `ui` tip is identical to `main`.
- `pranav/pets-triddy-nodey` demos/catalog already lived in the showcase tree; merge recorded ancestry without regressing `Data` `peregrine-1` mission ids.
- `deployer` tip added as `deployer/` + `deploy.{sh,ps1,cmd}` without replacing showcase surfaces.
- WIP helpers `wip/v0-map-story` / `wip/v0-map-story-pets` are staging history only (not re-merged as product tips).
- Preserved for UI sibling wrap: `web/engine.html`, `web/map.html`, `web/story/`, `demos/js-*`, `src/{data,engine,map,story}/`, `data/`.

## Conflicts resolved during refresh

1. **`.gitignore` (map merge)** — union of showcase + map ignores (`build/`, `out/`, `*.class`, Node, IDE, staging helpers).
2. **`README.md` (map / story merges)** — kept cohesive v0 showcase README; folded map attribution & story refresh notes; updated tip SHAs.
3. **Story tip rewrite (`12e20f6`)** — both-added story files (`STORY.md`, `run-story.*`, Passport/server/client); took latest story tip content while retaining non-story showcase tree.
4. **`pranav/pets-triddy-nodey`** — ancestry merge only; avoided regressing `peregrine-1` mission ids from newer `Data` tip.
5. **`deployer`** — ours-strategy merge + explicit checkout of `deployer/` tooling so showcase `src/`/`web/`/`data/` were not deleted.

