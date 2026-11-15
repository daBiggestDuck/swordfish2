# swordfish2 v0 tip SHAs

Source branch tips merged into GitHub branch v0 on daBiggestDuck/swordfish2.

Verified via git fetch origin --prune + gh api repos/daBiggestDuck/swordfish2/branches.

Branch tip at docs commit: 13df2be7100834371e9f22f250f5c44b8b4f22cc (13df2be). Prefer: git rev-parse origin/v0

Showcase ports: map :8080, story :8081, engine :8082.

| Branch | Full SHA | Short | Tip subject |
|---|---|---|---|
| `main` | `e2a0e5df9c2e49c794a9c13166a3f4baddd107af` | `e2a0e5d` | Rename project from 'swordfish2' to 'nasa space pet' |
| `Data` | `6b45ba186ba0220043a8b1b9b9b12ad919f9597e` | `6b45ba1` | fix: use stable mission id peregrine-1 for TO2-AB payloads |
| `engine` | `7c5db21ad61c18b7b4021cd9623ecd2716124aa0` | `7c5db21` | Rebuild engine in Java with real CLPS data and a local web page |
| `map` | `666ecee3b9a83cd434299582d3af7a05a1d99ab0` | `666ecee` | Enhance lunar map interactions and compatibility |
| `story` | `13f602199d9aa7dbd15603621543e64d758838b1` | `13f6021` | Add story: Java-served website with four pets, mission pop-ups, Pet Passport and Sun/Earth view |
| `pets` | `d921b00ee2787935c19841c63e398f1c06f039bb` | `d921b00` | CreateMoonPallFile |
| `ui` | `e2a0e5df9c2e49c794a9c13166a3f4baddd107af` | `e2a0e5d` | Rename project from 'swordfish2' to 'nasa space pet' |
| `pranav/pets-triddy-nodey` | `4dd133d9168322b81b2482b12529812b74e7028a` | `4dd133d` | feat: add Triddy/Nodey pets on Data tip |
| `deployer` | `fa1d89d020eb7f89e9f80a308d2d910f7a78547b` | `fa1d89d` | Deployer dashboard: branch table, merge-into-main checks, and PR flow diagram |
| `v0` | `13df2be7100834371e9f22f250f5c44b8b4f22cc` | `13df2be` | assembled showcase |

## Notes

- Prior v0 tip was 18e0b02; refresh merged tips that moved ahead (normal push; tip-doc only may have used force-with-lease on v0).
- ui tip is identical to main.
- pranav/pets-triddy-nodey demos/catalog already in tree; ancestry recorded without regressing Data peregrine-1 ids.
- deployer tip present as deployer/ + deploy.{sh,ps1,cmd}.
- WIP helpers wip/v0-map-story and wip/v0-map-story-pets not re-merged as product tips.
- Story tip defaults to :8082; v0 keeps story on :8081 so engine stays on :8082.
- Preserved for UI sibling wrap: web/engine.html, web/map.html, web/story/, demos/js-*, src/{data,engine,map,story}/, data/.

## Conflicts resolved during refresh

1. .gitignore (map) — union of showcase + map ignores.
2. README.md (map/story) — kept cohesive v0 showcase README; updated tip SHAs.
3. Story tip rewrites (12e20f6 then 13f6021) — took latest story files; retained non-story tree; forced story port back to 8081.
4. pranav/pets-triddy-nodey — ancestry / content keep without peregrine-1 regression; MissionEvent commas restored.
5. deployer — ours-strategy merge + checkout of deployer/ tooling so showcase surfaces were not deleted.
6. Data payloads — peregrine-1 mission ids + Triddy/Nodey petArchetype values (trident, ln-1).

