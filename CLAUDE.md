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

## Feature-Workflow

Wenn der Nutzer ein neues Feature bespricht (z. B. „ich will, dass …“), gilt folgende Reihenfolge:

1. **Erst besprechen:** Kläre mit dem Nutzer alle offenen Punkte, bevor du Code schreibst. Keine Annahmen stillschweigend umsetzen.
2. **Dann umsetzen:** Sobald alles geklärt ist, lege einen Feature-Branch an (z. B. `feature/...`) und implementiere das Feature dort.
3. **Nicht pushen:** Pushe den Branch nicht. Ein Push erfolgt nur nach ausdrücklichem Ja des Nutzers (siehe „Allgemein“). Ein Pull Request entsteht ebenfalls erst danach.
