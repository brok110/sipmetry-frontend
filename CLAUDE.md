# Sipmetry

Cocktail decision engine built with Expo (React Native) + Supabase.

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Skills
Check the available skills while scoping a task — before opening the first
file — not as a fallback after producing an answer. This covers the project's
own `.claude/skills/` plus the plugin and user skills listed in the session.

Load any skill whose description matches the task, even when the answer seems
obvious or could be reasoned out unaided. Invoke it with the Skill tool and
follow it in place of the default approach.

If a skill plausibly matches but is judged not worth loading, say so explicitly
rather than silently skipping it.

Currently in `.claude/skills/`:
- `vercel-react-native-skills` — React Native / Expo performance and best
  practices. Required reading for any RN component, list, animation, or gesture
  work, and for any performance review of the same.
