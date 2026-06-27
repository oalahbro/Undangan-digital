# Deploy Multi-Client (Multi-Tenant)

Satu app, satu proses Node, melayani banyak client. Tiap client (tenant) punya data,
admin, dan upload sendiri. Server menentukan "ini client siapa" dari:

1. **Subdomain** — `demo.undanganku.com` → client `demo` (produksi).
2. **Custom domain** — `undangan-eka.com` → client tertentu (alias).
3. **Cookie via `/t/<slug>`** — untuk **1 hostname** (Tailscale Funnel / dev / lokal).

## Kelola client (CLI)

```bash
node scripts/tenant.js add <slug> "<Nama>" [password]   # buat client (password acak bila kosong)
node scripts/tenant.js list                              # daftar client
node scripts/tenant.js passwd <slug> [password]          # ganti password admin client
node scripts/tenant.js domain <slug> <domain.com>        # daftarkan custom domain
node scripts/tenant.js remove <slug>                     # hapus dari registry
```

- Data tiap client: `data/tenants/<slug>.json` (dari `data/template.json` saat dibuat).
- Upload tiap client: `assets/uploads/<slug>/`.
- Registry + password (hash scrypt): `data/tenants.json` (**di-gitignore**, jangan di-commit).
- Admin tiap client: buka `/admin` di konteks client itu, login pakai **password** client (kolom username diabaikan).

## Test di laptop

```bash
npm install
PORT=3000 node server.js
```

- **Via path (paling gampang):** `http://localhost:3000/t/demo` → masuk client demo, lalu `/` & `/admin`.
- **Via subdomain:** `http://demo.localhost:3000/` (`*.localhost` otomatis ke 127.0.0.1 di mayoritas OS).

## Test di VPS + Tailscale Funnel

Funnel hanya memberi **1 hostname** (`<mesin>.<tailnet>.ts.net`) — jadi pakai metode **cookie `/t/<slug>`**.

1. Di VPS: `tailscale up`, lalu pastikan di admin console Tailscale: **HTTPS/MagicDNS ON** dan **Funnel** diizinkan untuk node ini (ACL `nodeAttrs` → `funnel`).
2. Jalankan app:
   ```bash
   npm install
   node scripts/tenant.js add demo "Eka & Salsa" demo123
   PORT=3000 node server.js        # atau: pm2 start server.js
   ```
3. Expose ke publik:
   ```bash
   tailscale funnel 3000           # atau: tailscale funnel --bg 3000
   ```
   → publik di `https://<mesin>.<tailnet>.ts.net`.
4. Akses:
   - Undangan: `https://<mesin>.<tailnet>.ts.net/t/demo`
   - Admin:    buka `/t/demo` dulu (set cookie), lalu `https://<mesin>.<tailnet>.ts.net/admin`
   - Link tamu: generator di admin otomatis menghasilkan `https://<host>/t/demo?to=Nama`.

> Catatan: di 1-host, 1 browser hanya "di" 1 client pada satu waktu (cookie). Untuk pindah client, buka `/t/<slug-lain>`.

## Produksi (Caddy + wildcard subdomain)

Skema subdomain butuh domain sendiri + wildcard DNS + reverse proxy.

1. Beli domain, mis. `undanganku.com`. Buat **wildcard DNS**: `*.undanganku.com` → IP VPS (+ `undanganku.com` → IP VPS).
2. Set di `.env`:
   ```
   PORT=3000
   BASE_DOMAIN=undanganku.com
   ```
3. `Caddyfile`:
   ```
   *.undanganku.com, undanganku.com {
       reverse_proxy localhost:3000
   }
   ```
   Untuk sertifikat wildcard, pakai DNS-challenge (Caddy + plugin DNS provider, mis. Cloudflare) atau **on-demand TLS**.
4. Jalankan Node (pm2) + Caddy. Tambah client → langsung aktif **tanpa ubah DNS/Caddy**:
   ```bash
   node scripts/tenant.js add eka-salsa "Eka & Salsa"
   # → https://eka-salsa.undanganku.com langsung jalan
   ```
5. Link tamu produksi: generator otomatis pakai `https://eka-salsa.undanganku.com/?to=Nama` (tanpa `/t/` karena tenant sudah di subdomain).

## Custom domain per client (opsional, paket premium)

```bash
node scripts/tenant.js domain eka-salsa undangan-eka-salsa.com
```
Client arahkan domainnya (A record) ke IP VPS. Caddy on-demand TLS urus sertifikatnya.

## Backup

`data/tenants/<slug>.json` ditulis ulang tiap simpan, dengan salinan otomatis ke
`data/tenants/backup/<slug>-<timestamp>.json`. Backup folder ini sebaiknya rutin di-rsync ke storage lain.
