# Fleeman Fitness Base

A phone-first progressive web app for personal workout planning and automatic progression.

## Included

- Three starter workouts
- Custom workout builder
- Exercise, set, rep, and weight logging
- Automatic next-session weight recommendations
- Training history
- Offline support
- Home-screen app icon
- JSON backup export/import
- Local storage, so no account or server is required

## Run it locally

Because service workers require a web server, do not double-click index.html.

### Python

Open a terminal in this folder and run:

```bash
python3 -m http.server 8080
```

Then visit:

```text
http://localhost:8080
```

### VS Code

Install the Live Server extension, then open index.html with Live Server.

## Put it on your iPhone

The easiest free option is to upload this folder to GitHub and deploy it through GitHub Pages, Netlify, or Vercel.

After opening the deployed site in Safari:

1. Tap the Share button.
2. Tap Add to Home Screen.
3. Tap Add.

The app will open full-screen from its own icon.

## Progression logic

- Complete every set at the top of the rep range without marking the exercise very hard or failed: add the default increment.
- Miss the bottom of the rep range or mark failed: reduce by the default increment.
- Otherwise: retain the same weight and try to add repetitions.

## Important

All information is stored in the browser on that device. Use Export backup periodically until cloud synchronization is added.
