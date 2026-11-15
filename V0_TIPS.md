# `v0` tip SHAs

Record of remote tips merged (or noted) into `v0` on
[daBiggestDuck/swordfish2](https://github.com/daBiggestDuck/swordfish2).

Fetched from `origin` at assemble time. Showcase ports on this branch:
**map `:8080`**, **story `:8081`**, **engine `:8082`**.

| Branch | Short | Full SHA | Merged into `v0`? | Notes |
|---|---|---|---|---|
| `main` | `e2a0e5d` | `e2a0e5df9c2e49c794a9c13166a3f4baddd107af` | yes | rename baseline (“nasa space pet”) |
| `Data` | `6b45ba1` | `6b45ba186ba0220043a8b1b9b9b12ad919f9597e` | yes | includes `peregrine-1` mission-id fix |
| `engine` | `7c5db21` | `7c5db21ad61c18b7b4021cd9623ecd2716124aa0` | yes | Java engine + `web/engine.*` |
| `map` | `666ecee` | `666ecee3b9a83cd434299582d3af7a05a1d99ab0` | yes | interactive lunar explorer + static hosting |
| `story` | `12e20f6` | `12e20f68cd13f33f31085b61897d82faf2ec3dac` | yes | Passport/CORS/engine-bridge; ports remapped for v0 |
| `pets` | `d921b00` | `d921b00ee2787935c19841c63e398f1c06f039bb` | yes | `petSpriteOutline` |
| `ui` | `e2a0e5d` | `e2a0e5df9c2e49c794a9c13166a3f4baddd107af` | yes | identical to `main` (no extra files) |
| `pranav/pets-triddy-nodey` | `4dd133d` | `4dd133d9168322b81b2482b12529812b74e7028a` | yes | Triddy/Nodey + `demos/js-*` |
| `deployer` | `4a42a15` | `4a42a15d210a8c7fab218a05428c3ac5badd9eca` | **no** | separate local branch dashboard; left on its own branch |

## Entrypoints preserved (not a tabbed shell)

- `web/map.html`, `web/engine.html`, `web/story/`
- `demos/js-pets/`, `demos/js-engine/`, `demos/js-ui/`
- root `index.html` → map redirect; `./run.sh` / `./run_map.sh`, `./run-story.sh`, `./run-engine.sh`
