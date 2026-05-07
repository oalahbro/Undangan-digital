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

## Personalisasi Nama Tamu

Tambahkan query parameter `?to=` dan `?address=` di URL:
```
index.html?to=Bapak%20Joris&address=Jakarta
```
Nama dan alamat tamu akan otomatis muncul di cover.

## Kustomisasi

Edit langsung file-nya — semua data placeholder ada di `index.html`:

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
- **Accessible** — support `prefers-reduced-motion`
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
