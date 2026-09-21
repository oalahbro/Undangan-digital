# Undangan Pernikahan — Modern Minimalist

Landing page undangan pernikahan digital dengan tema **Modern Minimalist** — palet soft neutral grey, photo-forward, clean typography (Italiana + Cormorant Garamond italic + Inter).

## Cara Menjalankan

**Cara 1 — Buka langsung (paling cepat):**
Double-click `index.html` di File Explorer.

**Cara 2 — Via XAMPP:**
Copy seluruh folder `undangan/` ke `C:\xampp\htdocs\`, lalu buka:
```
http://localhost/undangan/
```

> Cara 1 & 2 hanya untuk **melihat** undangan (konten default). Untuk **panel admin** dan **RSVP** yang berfungsi, jalankan lewat server di bawah.

**Cara 3 — Dengan server (admin & RSVP aktif):**
Butuh Node.js. Dari folder project:
```bash
npm install
npm start
```
Lalu buka `http://localhost:3000`. Server ini sekaligus menyajikan panel admin & API RSVP.

## Panel Admin

Akses: **`http://localhost:3000/admin`**

**Login:**
- Username & password diatur lewat file `.env` (contoh ada di `.env.example`):
  ```
  ADMIN_USER=admin
  ADMIN_PASS=ganti-password-ini
  PORT=3000
  GUEST_LINK_SECRET=<string-acak-panjang>
  ```
- Kalau `.env` belum dibuat, server memakai default **`admin` / `admin123`** — wajib diganti sebelum online.
- `GUEST_LINK_SECRET` adalah kunci enkripsi link tamu. Generate sekali:
  ```
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Jangan diganti setelah link disebar — semua link tamu jadi tidak valid.
- Setelah mengubah `.env`, **restart server** agar nilai baru terbaca.

**Yang bisa dikelola dari admin** (semua tersimpan ke `data/wedding.json`, auto-backup di `data/backup/`):

| Tab | Isi |
|-----|-----|
| **Media** | Upload/ganti: gambar cover, teks quote, gambar gift, **video**, dan **lagu/backsound** |
| **Mempelai** | Nama, orang tua, foto, Instagram |
| **Alamat** | Venue & alamat pengiriman kado |
| **Event** | Tanggal, jam, lokasi + map link Akad/Resepsi |
| **Link Tamu** | Generate link undangan personal per nama (terenkripsi) |
| **Our Story** | Timeline (tahun, judul, deskripsi, gambar) |
| **Bank** | Rekening (bank, atas nama, nomor) |
| **Social Media** | Instagram & WhatsApp |
| **Comments** | Lihat & hapus ucapan/RSVP dari tamu |

Setiap field gambar/video/lagu punya tombol **"⤴ Upload"** (file disimpan ke `assets/uploads/`) + preview. Klik thumbnail untuk popup besar.

> `.env` tidak ikut ke Git (ada di `.gitignore`), jadi password admin tidak bocor ke repo.

## Link Tamu (Nama Terenkripsi)

Link tamu dibuat dari **Panel Admin → tab Link Tamu**. Tempel daftar nama (satu per baris) → **Generate** → **Copy** / **Download CSV**.

Nama dienkripsi di server dengan AES-256-GCM, jadi URL hanya berisi token acak:
```
https://undangan.contoh.id/?g=eyJ2IjoxLCJkIjoiYkZ4...
```

- Nama tamu otomatis muncul di cover undangan (`Kepada Yth. ...`).
- Satu link terikat pada satu nama. Token yang diubah/dipalsukan tidak bisa membuka undangan — muncul halaman "Link Undangan Tidak Valid".
- Kunci enkripsi ada di `GUEST_LINK_SECRET` (`.env`) dan tidak pernah dikirim ke browser.
- Format lama `?to=Nama` **sudah tidak dipakai** — link lama tidak lagi memunculkan nama tamu.

> URL `/index.html?...` otomatis di-redirect ke `/?...` oleh server, jadi `index.html` tidak pernah muncul di link yang disebar.

## Kustomisasi

**Cara termudah:** ubah lewat **[Panel Admin](#panel-admin)** (`/admin`) — perubahan langsung tampil di undangan tanpa edit kode.

Atau edit nilai default-nya langsung di file (dipakai sebagai fallback bila server mati):

| Apa | Di mana |
|-----|---------|
| Nama mempelai | cari `Eka` dan `Salsa` di `index.html` |
| Tanggal acara | `WEDDING_DATE` di `js/main.js` baris 6, dan teks di `index.html` |
| Foto couple & gallery | URL `https://images.unsplash.com/...` di `index.html` → ganti ke foto sendiri |
| Venue & map link | Section `.events` di `index.html` |
| Nomor rekening | Section `.gift` di `index.html` |
| Palet warna | CSS variables di `:root` dalam `css/style.css` |

## Struktur Section

1. Cover (full-bleed photo + overlay) — tombol "Buka Undangan"
2. Quote pembuka (QS. Ar-Rum : 21)
3. Our Love Story (timeline + thumbnail)
4. Bride & Groom (2 card dengan foto square, ortu, IG)
5. Events — Akad & Resepsi dengan hero photo venue
6. Counting Days — 4 box countdown live
7. Health Protocol — 4 icon (masker, cuci tangan, jaga jarak, cek suhu)
8. RSVP & Wishes (form + wall ucapan, simpan ke localStorage)
9. Wedding Gifts — kartu rekening (copy-to-clipboard) + alamat kado
10. Closing (penutup + monogram nama)

## Catatan Teknis

- **Vanilla** — tidak butuh build tool, framework, atau dependencies
- **Responsive** — desktop, tablet, mobile (breakpoint 720px & 380px)
- **Offline-ready** kecuali Google Fonts dan gambar Unsplash (ganti ke file lokal jika perlu offline total)

## Font

- **Italiana** — display (nama mempelai di cover & closing)
- **Cormorant Garamond** — section titles (italic)
- **Inter** — body & UI

Semua dari Google Fonts, auto di-load via `<link>` di `<head>`.

## Palette

Soft neutral:
- Background: `#EDEDED`
- Card: `#FFFFFF`
- Ink: `#1A1A1A`
- Muted: `#6B6B6B`
- Accent button: solid black pill

Ubah di `:root` (`css/style.css`) jika mau sesuaikan ke brand color lain.
