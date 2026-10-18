# Remainder Docker deployment

1. Build desktop assets on the release machine: `pnpm --filter desktop build`.
2. Copy this repository to the server, including `desktop/dist`.
3. Copy `.env.example` to `.env`, set `SITE_ADDRESS`, `AUTH_SECRET`, and `BOOTSTRAP_PASSWORD`.
4. Start with `docker compose up -d --build`.
5. Verify `https://<domain>/api/health`, then login as the bootstrap owner.
6. Do not commit `deploy/.env`; it contains credentials.

Current milestone uses the existing SQLite data volume. PostgreSQL and S3-compatible object storage are introduced with M37 before additional users are enabled.
