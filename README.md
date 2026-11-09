# BingeBox

A cinematic React application with an Express API, SQLite database, account profiles, an admin dashboard and server-side AnimeDoc integration.

## Run locally

Use Node 22 (`nvm use`), then run `npm run setup` if dependencies are missing and `npm run dev` to start the frontend and API. Vite prints the available frontend URL; the API defaults to port 8787. Native SQLite dependencies must be installed with the same Node version used to run the API.

Configuration lives in the ignored `server/.env`; available settings are documented in `server/.env.example`. Keep all API credentials on the server. An `ANIMEDOC_API_KEY` is required. The public catalog combines real AnimeDoc titles with movies and series published by administrators. No sample catalog or fallback video is seeded. Published studio content remains available when AnimeDoc is unconfigured or temporarily unavailable.

Administrators sign in at `/admin/login`. The Studio dashboard links to movie/series importing, metadata and artwork editing, authorised video sources, categories, users and analytics. Profiles contain a name and an avatar, with separate watchlists and viewing history.

Use **Configure API key** in Studio to open the AnimeDoc setup dialog. Enter a key starting with `ad_live_`, then choose **I’ve added my key**. The authenticated, CSRF-protected server endpoint validates the format and atomically updates only `ANIMEDOC_API_KEY` in `server/.env`, with owner-only file permissions. It applies the key to the running server and clears provider caches immediately. The key is never returned by the API or stored in browser storage. The server directory must be writable and persisted by the host. Saving validates format; AnimeDoc determines whether a key and its streaming plan are usable.

## Features checked against the product brief

| Area | Implementation |
| --- | --- |
| Identity and design | Original BingeBox logo, black/charcoal canvas, red actions, responsive layouts, page transitions and reduced-motion support. |
| Home and discovery | Featured titles with descriptions and ratings; trending, popular, recent, top-rated, continuing and recommended rows; genre discovery and an editorial spotlight. |
| Catalog | Ten public genres in the requested order, movie/series filters, individual years and decades, sorting, pagination and title/genre/year search. Home rows and rankings preserve the provider feed. Browse pages advance the upstream pagination cursor instead of stopping at locally cached titles. Animation includes films, TV animation and anime. Nollywood is a separate Nigerian collection with a Yoruba language filter. |
| Title details | Poster, backdrop, synopsis, release date, duration, labelled IMDb/provider and member scores, available cast/crew, trailers, similar titles and episode selection. |
| Playback | Play/pause, timeline, volume, fullscreen, subtitle conversion, quality selection, protected byte-range streaming, episode navigation and saved progress. |
| Accounts | Signup/login, password recovery, multiple profiles, persistent watchlists, history, ratings and recommendations. |
| Administration | Movie creation and publishing, AnimeDoc import, title/category/user management, video/image/subtitle uploads, authorised video URLs, draft/publish controls and activity analytics. Provider sync preserves editorial changes and remembers deletions. |
| Reliability | Input validation, hashed passwords and recovery tokens, cookie sessions, CSRF checks, provider caching, image resizing, lazy page loading and error/retry states. |

The live catalog imports movie and series metadata from [AnimeDoc](https://www.animedoc.cloud/docs/live-movie-api). Source metadata may omit crew, synopses, ratings or episodes; missing information is not fabricated. Admins can add or correct it. Playback sources are resolved at the start of each playback. Movies use `se=0&ep=0`; TV uses the selected season and episode. Browser-compatible renditions, stable source IDs, an initial metadata byte range, fallback and fresh-source retries support reliable playback. Provider credentials are never included in browser responses.


## Publish your own movie

In **Studio → Add content → Add your own movie**, enter the title, synopsis, genre and artwork. Under **Video & subtitles**, upload an MP4 (H.264/AAC recommended) or WebM file up to 2 GB, or use a URL from an authorised CDN. Uploads stream to disk instead of buffering the movie in memory. Save a draft to keep it private, or choose **Publish** to make it visible on home, movie browsing, genre filters, search, watchlists and the player. Featured studio titles can appear in the hero. Unpublishing and deleting remove the title from public discovery.

Studio videos are served with byte-range support for seeking. Files are stored in the configured uploads directory; persist it together with the database. Reverse proxies must allow the required upload size and request duration. Uploaded content uses its stored source and never requests AnimeDoc media for playback.

## Password-reset email

Set `RESEND_API_KEY`, `EMAIL_FROM` (a verified sender) and `APP_URL` to enable delivery through [Resend](https://resend.com/docs/api-reference/emails/send-email). Development without an email provider returns a reset link directly. Production does not expose reset links or log recovery tokens and reports recovery as unavailable if email is not configured.

## Validate

- `npm run typecheck`
- `npm --prefix server test`
- `npm run build`

Regression tests use isolated temporary databases and mock the external API and email delivery. They cover removal of the old sample catalog and demo user, provider-only feeds and pagination, search parsing, animation categories, series episodes, the stream proxy, subtitles, admin import and editorial changes, signup/login, profile isolation, watchlists, ratings, progress, uploads, user suspension and single-use password recovery.

## Hosting

`npm run build` creates the frontend and server output. `npm start` serves both through Express. Production requires `ADMIN_PASSWORD` and `APP_URL`; persist the database and uploads directories. This version uses SQLite and local uploads for one application server. Horizontal scaling requires a shared database/storage architecture and appropriate video delivery capacity. Streaming-provider access does not replace title-specific distribution rights; record source and licensing information in the title editor.
