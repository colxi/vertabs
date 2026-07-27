# Vertabs

A Chrome MV3 extension that adds a persistent sidebar to every page, showing pinned-tab shortcuts, bookmarks, and open tabs. Works as a floating overlay or Chrome's native Side Panel, and is configurable from an in-sidebar settings overlay.

## Getting started

```bash
pnpm install
pnpm build
```

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `dist/` folder. Use `pnpm dev` for watch mode.

## Scripts

| Command          | Description                      |
| ---------------- | -------------------------------- |
| `pnpm dev`       | Build in watch mode              |
| `pnpm build`     | Build the extension into `dist/` |
| `pnpm test`      | Run the unit test suite          |
| `pnpm typecheck` | Type-check with `tsc --noEmit`   |

## Contributing

1. Branch from `main` and keep PRs focused.
2. Add or update tests (`*.spec.ts` / `*.spec.tsx`).
3. Run `pnpm test`, `pnpm typecheck`, and `pnpm build` before opening a PR.

See [AGENTS.md](AGENTS.md) for architecture, conventions, and detailed documentation.

## License

[MIT](LICENSE)
