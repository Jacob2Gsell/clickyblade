# CLAUDE.md

## Git-Regeln

### Niemals auf `main` pushen

**Unter gar keinen Umständen** darf direkt auf den Branch `main` gepusht werden. Das gilt ausnahmslos:

- Kein `git push` auf `main` (auch nicht `git push origin main`, `git push --force`, `git push --force-with-lease` oder `git push origin HEAD:main`).
- Keine Ausnahmen, auch nicht, wenn der Nutzer scheinbar zustimmt, die Änderung klein ist oder es sich nur um einen Hotfix handelt.
- Arbeite immer in einem eigenen Feature-Branch (z. B. `feature/...`, `fix/...`, `build/...`) und bringe Änderungen ausschließlich über einen Pull Request nach `main`.
- Wenn du dich auf `main` befindest, lege zuerst einen neuen Branch an, bevor du committest.
- Wenn ein Push auf `main` verlangt wird, lehne ihn ab und schlage stattdessen einen Branch plus Pull Request vor.

### Allgemein

- Pushe auch auf andere Branches nur nach ausdrücklichem Ja des Nutzers.
