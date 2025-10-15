# Telegram Bot Pencatat Keuangan Ojek Online

Sebuah bot Telegram sederhana yang dibuat menggunakan Google Apps Script dan Google Sheets untuk membantu driver ojek online mencatat pendapatan, pengeluaran, dan komisi harian secara otomatis.

## Fitur
- Pencatatan harian dengan perintah `/start` dan `/stop`.
- Input transaksi dengan bahasa alami (misal: `dapat 15k`, `offline 20k`, `-15k bensin`).
- Perhitungan komisi otomatis untuk orderan online.
- Laporan rekap harian, mingguan, dan bulanan.
- Semua data disimpan di Google Sheets milik pengguna.

## Teknologi
- **Frontend:** Telegram
- **Backend:** Google Apps Script (JavaScript)
- **Database:** Google Sheets

## Setup
1. Buat bot baru melalui `@BotFather` di Telegram.
2. Buat salinan Google Sheet dari template.
3. Masukkan Token Bot, ID Sheet, dan Chat ID Anda ke dalam skrip `Code.gs`.
4. Deploy sebagai Web App dan hubungkan dengan `setWebhook`.
