<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- 3D chrome glyphs render through `src/components/three/ChromeGlyph` (lazy, client-only) so SSR never touches WebGL.
- Auth is demo-only (browser storage in `src/lib/auth.ts`) until a real backend is enabled.
- Workspace navigation uses a controlled Radix modal portal outside the main layout so it never shifts content and provides focus trapping, Escape dismissal, and focus restoration.
- Settings use a collision-aware Radix popover anchored to their trigger; appearance preferences are applied centrally through prefs so every page stays in sync.
