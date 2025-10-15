// ============== KONFIGURASI PRIBADI ANDA ==============
const TOKEN = "CHANGE_WITH_YOUT_BOT_TOKEN";
const SHEET_ID = "CHANGE_WITH_YOUR_SHEET_ID";
const MY_CHAT_ID = "CHANGE_WITH_YOUR_CHAT_ID";
// ======================================================

// Gunakan Sesuai Nama di SHEET Anda
const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Sheet1"); 
const telegramUrl = "https://api.telegram.org/bot" + TOKEN;

// =====================================================================
// =================== BAGIAN FUNGSI UTAMA & PERINTAH ==================
// =====================================================================

function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    if (!contents.message) return; // Abaikan update non-pesan
    const chatId = contents.message.chat.id.toString();
    const text = contents.message.text;

    if (chatId !== MY_CHAT_ID) { return; }

    if (text.startsWith("/")) { handleCommand(chatId, text); } 
    else { handleTransaction(chatId, text); }
  } catch (error) {
    Logger.log(error.toString());
  }
}

function handleCommand(chatId, command) {
  const userProperties = PropertiesService.getUserProperties();
  if (command === "/start") {
    userProperties.setProperty("tracking_status", "STARTED");
    const today = Utilities.formatDate(new Date(), "GMT+7", "d MMMM yyyy");
    sendMessage(chatId, `Oke, semangat ngojol hari ini! 🔥 Pencatatan untuk tanggal ${today} sudah dimulai.`);
  } else if (command === "/stop") {
    if (userProperties.getProperty("tracking_status") !== "STARTED") {
      sendMessage(chatId, "Pencatatan belum dimulai. Ketik /start dulu ya.");
      return;
    }
    userProperties.deleteProperty("tracking_status");
    sendDailyRecap(chatId, new Date());
  } else if (command === "/minggu") { sendWeeklyRecap(chatId); }
  else if (command === "/bulan") { sendMonthlyRecap(chatId); }
  else if (command === "/undo") { undoLastTransaction(chatId); }
  else { sendMessage(chatId, "Perintah tidak dikenali."); }
}

function handleTransaction(chatId, text) {
  const userProperties = PropertiesService.getUserProperties();
  if (userProperties.getProperty("tracking_status") !== "STARTED") {
    sendMessage(chatId, "Pencatatan belum dimulai atau sudah dihentikan hari ini.");
    return;
  }
  parseAndLog(chatId, text);
}

// =====================================================================
// =========== PARSING & LOGGING (SESUAI SHEET) ========================
// =====================================================================

function calculateCommission(orderAmount) {
  if (orderAmount < 10000) { return Math.round(orderAmount * 0.10); } 
  else { return Math.round(orderAmount * 0.15); }
}

function parseAndLog(chatId, text) {
  text = text.toLowerCase();
  let responseMsg = "";
  
  const now = new Date();
  const date = Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd");
  // Template baris baru sesuai 7 kolom: [A:Tgl, B:Offline, C:Online, D:Tip, E:Pengeluaran, F:Komisi, G:Timestamp]
  let newRow = [date, '', '', '', '', '', now]; 

  // Cek Pengeluaran
  if (text.startsWith("-")) {
    const match = text.match(/-(\d+[\.,]?\d*k?)\s*(.*)/);
    if (match) {
      const amount = normalizeNumber(match[1]);
      const description = match[2] || "Pengeluaran";
      newRow[4] = `${amount}(${description})`; // Kolom E: Pengeluaran
      responseMsg = `- Dicatat: Pengeluaran ${formatRupiah(amount)} (${description})`;
    }
  } 
  // Cek Orderan
  else {
    const isOffline = text.includes("offline");
    const numbers = text.match(/(\d+[\.,]?\d*k?)/g);
    
    if (numbers && numbers.length > 0) {
      const orderAmount = normalizeNumber(numbers[0]);
      let tipAmount = 0;
      let commissionAmount = 0;

      // Cek apakah ada tip
      if (text.includes("dibayar") && numbers.length >= 2) {
        const paidAmount = normalizeNumber(numbers[1]);
        tipAmount = paidAmount - orderAmount;
      }
      
      // Masukkan data ke kolom yang benar
      if (isOffline) {
        newRow[2] = orderAmount; // Kolom c: Online
      } else {
        newRow[1] = orderAmount; // Kolom C: Offline
        commissionAmount = calculateCommission(orderAmount);
        newRow[5] = commissionAmount > 0 ? commissionAmount : ''; // Kolom F: Komisi
      }
      
      newRow[3] = tipAmount > 0 ? tipAmount : ''; // Kolom D: Tip

      // Buat pesan balasan
      responseMsg = `✅ Dicatat: Orderan ${isOffline ? 'Offline' : 'Online'} ${formatRupiah(orderAmount)}`;
      if (tipAmount > 0) { responseMsg += `, Tip ${formatRupiah(tipAmount)}`; }
      if (commissionAmount > 0) { responseMsg += ` & Komisi ${formatRupiah(commissionAmount)}`; }
    }
  }

  if (responseMsg) {
    sheet.appendRow(newRow);
    sendMessage(chatId, responseMsg);
  } else {
    sendMessage(chatId, "Format tidak dikenali. Coba:\n'offline 15k'\n'dapat 8.900 dibayar 10k'\n'-20k bensin'");
  }
}

// =====================================================================
// =================== REKAP (SESUAI SHEET) ============================
// =====================================================================

function sendRecapForPeriod(chatId, startDate, endDate, periodName, periodText) {
  const startYMD = Utilities.formatDate(startDate, "GMT+7", "yyyy-MM-dd");
  const endYMD = Utilities.formatDate(endDate, "GMT+7", "yyyy-MM-dd");

  const data = sheet.getDataRange().getValues();
  let summary = { orders: 0, income: 0, tips: 0, expenses: 0, commission: 0 };

  for (let i = 2; i < data.length; i++) { // Mulai dari baris 3 karena ada sub-header di sheet
    const row = data[i];
    if(!row[0]) continue; // Lewati baris kosong
    const rowDateStr = Utilities.formatDate(new Date(row[0]), "GMT+7", "yyyy-MM-dd");

    if (rowDateStr >= startYMD && rowDateStr <= endYMD) {
      const offlineIncome = parseFloat(row[1]) || 0;
      const onlineIncome = parseFloat(row[2]) || 0;
      
      if (offlineIncome > 0 || onlineIncome > 0) {
        summary.orders++;
        summary.income += offlineIncome + onlineIncome;
      }

      summary.tips += parseFloat(row[3]) || 0;       // Kolom D: Tip
      summary.commission += parseFloat(row[5]) || 0; // Kolom F: Komisi

      const pengeluaranStr = row[4]; // Kolom E: Pengeluaran
      if (pengeluaranStr) {
        const match = pengeluaranStr.toString().match(/(\d+)/);
        if (match) { summary.expenses += parseFloat(match[1]) || 0; }
      }
    }
  }

  const grossIncome = summary.income + summary.tips;
  const netIncome = grossIncome - summary.expenses - summary.commission;

  let title = `📊 Rekap Total *${periodName}*`;
  if(periodName === 'harian') title = `🏁 Pencatatan hari ini selesai!`;

  const message = `${title}
${periodText}

📦 *Total Orderan:* ${summary.orders}
💰 *Total Penghasilan:* ${formatRupiah(summary.income)}
💸 *Total Tip:* ${formatRupiah(summary.tips)}
📈 *Total Penghasilan Kotor:* *${formatRupiah(grossIncome)}*
⛽️ *Total Pengeluaran:* ${formatRupiah(summary.expenses)}
✂️ *Total Komisi:* ${formatRupiah(summary.commission)}
---
✨ *Pendapatan Bersih:* *${formatRupiah(netIncome)}*`;

  sendMessage(chatId, message, 'Markdown');
}

// Fungsi pembantu rekap
function sendDailyRecap(chatId, date) {
  const displayDate = Utilities.formatDate(date, "GMT+7", "d MMMM yyyy");
  sendRecapForPeriod(chatId, date, date, "harian", `Berikut rekap untuk tanggal *${displayDate}*:`);
}

function sendWeeklyRecap(chatId) {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const firstDayOfWeek = new Date(today);
    firstDayOfWeek.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    const lastDayOfWeek = new Date(firstDayOfWeek);
    lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
    const displayStart = Utilities.formatDate(firstDayOfWeek, "GMT+7", "d MMM");
    const displayEnd = Utilities.formatDate(lastDayOfWeek, "GMT+7", "d MMM yyyy");
    sendRecapForPeriod(chatId, firstDayOfWeek, lastDayOfWeek, "mingguan", `Periode: *${displayStart} - ${displayEnd}*`);
}

function sendMonthlyRecap(chatId) {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const displayStart = Utilities.formatDate(firstDayOfMonth, "GMT+7", "d MMM");
    const displayEnd = Utilities.formatDate(lastDayOfMonth, "GMT+7", "d MMM yyyy");
    sendRecapForPeriod(chatId, firstDayOfMonth, lastDayOfMonth, "bulanan", `Periode: *${displayStart} - ${displayEnd}*`);
}

// =====================================================================
// =================== FUNGSI BANTU ====================================
// =====================================================================

function undoLastTransaction(chatId) {
    const lastRow = sheet.getLastRow();
    if (lastRow <= 3) { // Asumsi header ada di baris 1-3
        sendMessage(chatId, "Tidak ada data untuk dihapus.");
        return;
    }
    sheet.deleteRow(lastRow);
    sendMessage(chatId, `↩️ Berhasil! Entri terakhir telah dihapus.`);
}

function normalizeNumber(str) {
  str = str.toString().toLowerCase();
  let multiplier = 1;
  if (str.includes('k')) { multiplier = 1000; }
  return parseFloat(str.replace(/[^0-9\.,]/g, '').replace(',', '.')) * multiplier;
}

function sendMessage(chatId, text, parseMode) {
  const payload = { 'method': 'sendMessage', 'chat_id': String(chatId), 'text': text, 'parse_mode': parseMode || '' };
  UrlFetchApp.fetch(telegramUrl + '/', { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload) });
}

function formatRupiah(number) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number); }

function setWebhook() {
  const webAppUrl = ScriptApp.getService().getUrl();
  const response = UrlFetchApp.fetch(telegramUrl + "/setWebhook?url=" + webAppUrl);
  Logger.log(response.getContentText());
}
