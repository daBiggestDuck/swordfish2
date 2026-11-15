# swordfish2 `v0` tip SHAs

Live tip: run `git rev-parse origin/v0` (this file last edited on parent of next commit).

Prior showcase tip: `18e0b02`. Refresh merged tips that had moved ahead (normal push; a later tip-doc rewrite briefly force-with-lease'd `v0` tip docs only).

Showcase ports: **map `:8080`**, **story `:8081`**, **engine `:8082`**.

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

## Notes

- `ui` tip is identical to `main`.
- Triddy/Nodey demos/catalog already lived in the showcase tree; merge recorded ancestry without regressing Data `peregrine-1` mission ids (kept `ln-1` / `trident` archetypes).
- `deployer` tip added as `deployer/` + `deploy.{sh,ps1,cmd}` without replacing showcase surfaces.
- WIP helpers `wip/v0-map-story` / `wip/v0-map-story-pets` are staging history only.
- Story tip alone preferred `:8082`; v0 keeps story on `:8081` so engine stays on `:8082`.

## Conflicts resolved during refresh

1. **Data / payloads.json** — took `peregrine-1` mission ids from Data; restored Triddy/Nodey `petArchetype` values (`trident`, `ln-1`).
2. **map (.gitignore, README)** — union gitignore (keep staging ignores); kept cohesive v0 showcase README; map scripts as `run_map.sh` + showcase `run.sh` alias.
3. **story (force-updated tip)** — both-added story files; took latest tip content (Passport `days`, CORS, engine event bridge) while retaining map/engine/demos and ports 8080/8081/8082.
4. **pranav/pets-triddy-nodey** — kept showcase README + Data-aligned payloads; demos already present.
5. **MissionEvent.java** — restored trailing commas broken by auto-merge with Triddy tip.
