# Application icons

`codexhost.png` is the 1024px BOFT CLI application icon used by macOS packaging.
The artwork is centered with its longest visible dimension at 896px, leaving
64px of transparent padding on that axis. Windows
launchers and the Inno Setup installer use `codexhost.ico`, with 16, 24, 32,
48, 64, 128, and 256 pixel frames. The uninstall listing uses `boft-start.exe`.

Run `node scripts/release/generate-brand-icons.mjs` on macOS after editing
`codexhost.png` to regenerate the Windows ICO frames. The generator resizes
this PNG; it does not use the separate Renderer artwork or SVG.
