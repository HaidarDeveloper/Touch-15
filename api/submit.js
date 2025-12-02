import { IncomingForm } from "formidable";
import fs from "fs";
import { Client } from "pg";
import fetch from "node-fetch";

// Disable default body parsing by Vercel
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ status: "error", message: "Method not allowed" });

  const form = new IncomingForm({ multiples: true });
  
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ status: "error", message: err.message });

    try {
      const jumlah_tiket = parseInt(fields.jumlah_tiket);
      if (!jumlah_tiket || jumlah_tiket < 1) return res.json({ status: "error", message: "Jumlah tiket tidak valid" });

      const hargaTiket = 40000;
      let diskon = 0;
      if (jumlah_tiket >= 2) diskon = 0.025;
      if (jumlah_tiket >= 3) diskon = 0.05;
      if (jumlah_tiket >= 4) diskon = 0.075;
      if (jumlah_tiket === 5) diskon = 0.1;
      const total_harga = jumlah_tiket * hargaTiket * (1 - diskon);

      const dataPembeli = [];

      for (let i = 1; i <= jumlah_tiket; i++) {
        const nama = fields[`nama_${i}`];
        const asal = fields[`asal_sekolah_${i}`];
        const wa = fields[`no_wa_${i}`];
        const email = fields[`email_${i}`];
        const file = files[`kartu_pelajar_${i}`];

        if (!nama || !asal || !wa || !email || !file) {
          return res.json({ status: "error", message: `Data peserta ${i} tidak lengkap` });
        }

        // Simpan file di /tmp karena Vercel serverless
        const ext = file.originalFilename.split('.').pop();
        const fileName = `${nama.replace(/[^a-zA-Z0-9_-]/g,'_')}.${ext}`;
        const filePath = `/tmp/${fileName}`;
        fs.copyFileSync(file.filepath, filePath);

        dataPembeli.push({
          nama, asal_sekolah: asal, no_wa: wa, email, kartu_pelajar: fileName
        });
      }

      // Connect ke Neon (PostgreSQL)
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();

      const insertRes = await client.query(
        `INSERT INTO tiket_pembelian (data_pembeli, jumlah_tiket, total_harga)
         VALUES ($1, $2, $3) RETURNING id`,
        [JSON.stringify(dataPembeli), jumlah_tiket, total_harga]
      );

      const lastId = insertRes.rows[0].id;
      const kodeUnik = `#TOUCH15${String(lastId).padStart(3,"0")}`;
      await client.query(`UPDATE tiket_pembelian SET kode_unik=$1 WHERE id=$2`, [kodeUnik, lastId]);

      await client.end();

      // Kirim ke Google Sheets
      const sheetUrl = "https://script.google.com/macros/s/AKfycbwmvSFLZHCahvSfX2KtbZBn50Ii2osw5s36rgsBa2NNjRPy72KD-jvH3he2blZ8t3MGpg/exec";
      const payload = { rekap: dataPembeli, kode_unik: kodeUnik, total_harga };
      const gsRes = await fetch(sheetUrl, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } });
      const gsJson = await gsRes.json();

      return res.json({ status: "success", message: "Data berhasil disimpan!", kode_unik: kodeUnik });
    } catch (e) {
      return res.json({ status: "error", message: e.message });
    }
  });
}
