# Watch

Watch is a private watch-together app for synchronized playback, Persian RTL chat, subtitles, and mobile-friendly rooms.

This is a standalone redesign based on the open-source WatchParty project. The upstream MIT license notice remains in [LICENSE](./LICENSE).

## Included in this version

- Local username/password access gate with no public signup.
- Admin panel for creating users, resetting passwords, disabling users, and deleting users.
- Synchronized rooms with direct MP4/HLS playback, playlists, chat, subtitles, and invite links.
- Upload a video to the VPS without waiting for conversion.
- Persistent background MKV/video to HLS queue with progressive playback after the first 30 seconds are available.
- Per-upload FFmpeg preset selection and a choice between early progressive playback or waiting for the complete conversion.
- H.264/yuv420p video, automatic AAC handling, six-second segments, posters, preview thumbnails, metadata, progress, speed, and ETA.
- Admin-configurable encoder preset, CRF, segment length, audio mode, original-file retention, and worker count.
- Admin controls to retry, cancel, rebuild, or remove individual media outputs.
- Persian-first RTL layout across navigation, forms, menus, chat, room settings, and admin tools.
- Compact mobile chat below the player and translucent fullscreen chat over the media.
- No subscription, billing, OAuth, profile-picture, GitHub-credit, or Discord-credit product surfaces.

## Quick start on Ubuntu

The easiest deployment path downloads the installer, clones Watch into `/opt/watch`, installs Docker Compose, starts the service, and restarts it after reboot:

```bash
curl -fsSL https://raw.githubusercontent.com/i5Git/watch/main/scripts/install-ubuntu.sh | bash -s -- --yes
```

The installer defaults to port `8080` and Docker Compose. It creates a strong admin password when one is not supplied, persists users and media under `data/`, and prints the final URL, admin username, and generated password.

For an interactive setup:

```bash
curl -fsSL https://raw.githubusercontent.com/i5Git/watch/main/scripts/install-ubuntu.sh | bash
```

Useful options:

```bash
# Update the existing /opt/watch checkout and rebuild it.
curl -fsSL https://raw.githubusercontent.com/i5Git/watch/main/scripts/install-ubuntu.sh | bash -s -- --update --yes

# Use another directory or public port.
curl -fsSL https://raw.githubusercontent.com/i5Git/watch/main/scripts/install-ubuntu.sh | \
  bash -s -- --yes --dir /srv/watch --port 8080

# Prompt for optional TURN, YouTube, Postgres, and Redis configuration.
curl -fsSL https://raw.githubusercontent.com/i5Git/watch/main/scripts/install-ubuntu.sh | \
  bash -s -- --advanced
```

If you already cloned the repository:

```bash
chmod +x scripts/install-ubuntu.sh
./scripts/install-ubuntu.sh --yes
```

The updater pulls the `main` branch and rebuilds the Compose service without overwriting an existing `.env`.

If you previously installed the older checkout under `/opt/watchparty`, update that exact installation with:

    curl -fsSL https://raw.githubusercontent.com/i5Git/watch/main/scripts/install-ubuntu.sh | \
      bash -s -- --update --yes --dir /opt/watchparty --repo https://github.com/i5Git/watch.git

## Manual Docker deployment

```bash
cp .env.example .env
# Edit .env locally. Do not commit it.
docker compose up -d --build
docker compose ps
```

The application listens inside the container on port `8080`. Set `APP_PORT` in `.env` to choose the host port.

## Local development

Requires Node.js 24 or newer.

```bash
npm ci
npm run ui
```

In another terminal:

```bash
npm start
```

The Vite UI runs on its development port and the Node server defaults to port `8080`.

## Configuration

The important server values are:

- `ADMIN_USERNAME` and `ADMIN_PASSWORD`: seed the first administrator on a new data directory.
- `AUTH_DATA_DIR`: user/session data directory. Default: `data`.
- `MEDIA_DATA_DIR`: uploaded media directory. Default: `data/media`.
- `UPLOAD_MAX_BYTES`: upload limit in bytes.
- `FFMPEG_PATH`: FFmpeg executable. Docker uses the image-installed `ffmpeg`.
- `FFPROBE_PATH`: FFprobe executable used for codec and duration metadata.
- `DATABASE_URL`, `REDIS_URL`, `YOUTUBE_API_KEY`, and TURN settings are optional.

Do not commit `.env`, database URLs, Redis URLs, TURN credentials, or other secrets. Keep the Docker Compose `./data:/usr/src/data` volume so users and uploaded media survive updates.

Each new upload is stored under `data/media/<movie-id>/`. The original file is preserved by default, while `master.m3u8`, numbered transport-stream segments, `poster.jpg`, `thumbnail.jpg`, and `metadata.json` are generated in the same folder. The queue survives restarts: interrupted jobs return to the queued state when Watch starts again.

The HLS playlist is published progressively. Once at least 30 seconds of segments exist, the room switches to the HLS source automatically and FFmpeg continues appending segments until the final playlist is complete. Media settings and per-movie recovery controls are available in the administrator panel.

The upload dialog can instead keep the room on its current media until conversion reaches 100%. In that mode it remains open and displays the encoding percentage, speed, status, and estimated remaining time.

For direct browser playback, MP4 with H.264/AAC or HLS is the safest choice. MKV and other containers are automatically converted through the room upload dialog.

## License

Watch remains distributed under the MIT License. See [LICENSE](./LICENSE) for the full notice.
