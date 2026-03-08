# Flip Deal Analyzer Desktop

This project runs as a desktop app with Electron and can be built into a Windows executable.

## Run in development

```bash
npm install
npm run desktop
```

## Build a Windows EXE on Windows

Install Node.js LTS first, then in this folder run:

```bash
npm install
npm run dist:win
```

That creates:

- `release/Flip Deal Analyzer.exe` (portable EXE)

To also create an installer, run:

```bash
npm run dist:win-installer
```

That creates:

- `release/Flip Deal Analyzer.exe`
- `release/Flip Deal Analyzer Setup.exe`

## Notes

- Saved deals are stored locally on the machine.
- You can export one deal or the whole deal library as JSON from inside the app.
- If SmartScreen warns you the first time, click **More info** and then **Run anyway**.
