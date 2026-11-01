# EQ Markets brand guide

The look EQ Markets already has, read from the live app at v2.1.0 (chart paper · deep ink · one clinical teal · Public Sans). Full guide: [DESIGN.html](DESIGN.html). Open it from a checkout: it loads the repo's own icons by relative path.

| What | Where |
|---|---|
| Mark | in the app: inline SVG in `index.html` (`.brand-mark`); app icons: `public/icons/` |
| Colours | `tokens.json` here, read from `src/styles/base.css` (light and dark) |
| Type | Public Sans 400–700 from Google Fonts, tabular figures |
| Component rules | [`DESIGN.md`](../../DESIGN.md) at the repo root |

Nothing in this folder is new artwork: every colour, font and file it names is already in the app.

## Repo avatar and social preview

| File | Where it's used |
|---|---|
| `docs/brand/avatar.png` | GitLab project avatar (Settings > General), 512×512 |
| `docs/brand/social-preview.png` | GitHub social preview (github.com/Ethosan/eqmarkets, Settings > Social preview), 1280×640 |

Every one of these repos follows the same spec: a 512×512 PNG avatar with the project's own mark on its own background to every edge, since GitLab and GitHub round it themselves; and, for repos mirrored to GitHub, a 1280×640 social preview with the avatar tile, the name and the repo description, no URL. Both are made from the mark, not new artwork.
