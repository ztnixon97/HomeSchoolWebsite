# Deploying WLPC to Fly.io

## Prerequisites

1. Install the Fly CLI: https://fly.io/docs/flyctl/install/
2. Create a Fly.io account: `fly auth signup`
3. Purchase your domain on Cloudflare

## First-Time Setup

### 1. Create the app on Fly.io

```bash
cd /path/to/JessicasHomeSchool
fly launch --no-deploy
```

When prompted, pick a unique app name (e.g., `wlpc-coop`) and the `iad` region
(Ashburn, VA). Say no to databases — we use SQLite on a volume.

Update the `app = "wlpc"` line in `fly.toml` with whatever name you chose.

### 2. Create a persistent volume for the database

```bash
fly volumes create wlpc_data --region iad --size 1
```

This creates a 1 GB volume (plenty for a 20-person co-op). The database and
uploaded files will live here and survive deploys.

### 3. Deploy

```bash
fly deploy
```

First deploy takes ~5 minutes (building Rust from source). Subsequent deploys
use Docker cache and are faster.

### 4. Verify it's running

```bash
fly open
```

You should see the WLPC homepage. Log in with the default admin credentials:
- Email: `admin@preschool.local`
- Password: `admin123`

**Change the admin password immediately after first login.**

## Connecting Your Cloudflare Domain

### 1. Get the Fly.io IP

```bash
fly ips list
```

Note the IPv4 and IPv6 addresses.

### 2. Set up DNS in Cloudflare

In your Cloudflare dashboard for the domain:

- Add an **A record**: `@` → (Fly IPv4 address), proxy enabled (orange cloud)
- Add an **AAAA record**: `@` → (Fly IPv6 address), proxy enabled
- (Optional) Add a **CNAME**: `www` → `your-domain.com`, proxy enabled

### 3. Configure SSL on Cloudflare

Go to SSL/TLS settings and set the mode to **Full (strict)**.

### 4. Add a TLS certificate on Fly.io

```bash
fly certs create your-domain.com
fly certs create www.your-domain.com  # if using www
```

Fly generates a free Let's Encrypt certificate. Cloudflare proxies traffic
with its own cert on the edge, and Fly's cert handles the origin connection.

## Ongoing Deploys

After making code changes, just:

```bash
fly deploy
```

## Backups

The SQLite database lives at `/data/preschool.db` on the volume. To back it up:

```bash
# SSH into the running machine and copy the DB
fly ssh console -C "cp /data/preschool.db /data/backup-$(date +%Y%m%d).db"
```

Or download it locally:

```bash
fly ssh sftp get /data/preschool.db ./preschool-backup.db
```

Consider setting up a weekly backup routine.

## Costs

For a 20-person co-op, expect roughly:
- **Fly.io shared-cpu-1x (256MB)**: ~$3-5/month (with auto-stop, less when idle)
- **1 GB volume**: $0.15/month
- **Cloudflare domain**: ~$10-15/year depending on TLD
- **Total**: ~$5/month + domain

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `DATABASE_PATH` | `data/preschool.db` | Path to SQLite database |
| `UPLOADS_DIR` | `uploads` | Directory for uploaded files |
| `PRODUCTION` | (unset) | Set to any value to enable production mode |
| `STATIC_DIR` | `static` | Directory containing built frontend files |

## Troubleshooting

**App won't start**: Check logs with `fly logs`

**Database locked errors**: The app uses WAL mode which handles concurrent reads
well. If you see lock errors, it's likely two machines running — scale to 1:
`fly scale count 1`

**Sessions lost on deploy**: Sessions are in-memory and reset on restart. Users
just need to log in again. For a 20-person co-op this is a minor inconvenience.

**Uploads not persisting**: Make sure `UPLOADS_DIR` points to a path on the
mounted volume (`/data/uploads`).
