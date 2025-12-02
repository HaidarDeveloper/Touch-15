import { IncomingForm } from "formidable";
import fs from "fs";
import path from "path";
import { Pool } from "pg";

export const config = {
  api: { bodyParser: false }, // penting untuk file upload
};

// Inisialisasi koneksi PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const form = new IncomingForm({ multiples: true, uploadDir, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ status: "error", message: err.message });

    try {
      const jumlah_tiket = parseInt(fields.jumlah_tiket);
      if (!jumlah_tiket || jumlah_tiket < 1 || jumlah_tiket > 5) {
        return res.status(400).json({ status: "error", message: "Jumlah tiket tidak valid" });
      }

      const hargaTiket = 40000;
      let diskon = 0;
      if (jumlah_tiket >= 2) diskon = 0.025;
      if (jumlah_tiket >= 3) diskon = 0.05;
      if (jumlah_tiket >= 4) diskon = 0.075;
      if (jumlah_tiket == 5) diskon = 0.1;

      const total_harga = jumlah_tiket * hargaTiket * (1 - diskon);

      const dataPembeli = [];

      for (let i = 1; i <= jumlah_tiket; i++) {
        const nama = fields[`nama_${i}`];
        const asal = fields[`asal_sekolah_${i}`];
        const no_wa = fields[`no_wa_${i}`];
        const email = fields[`email_${i}`];

        if (!nama || !asal || !no_wa || !email) {
          return res.status(400).json({ status: "error", message: `Data peserta ${i} tidak lengkap` });
        }

        const fileField = files[`kartu_pelajar_${i}`];
        if (!fileField) {
          return res.status(400).json({ status: "error", message: `File kartu pelajar peserta ${i} tidak ditemukan` });
        }

        const ext = path.extname(fileField.originalFilename).toLowerCase();
        const allowed = [".jpg", ".jpeg", ".png", ".pdf"];
        if (!allowed.includes(ext)) {
          return res.status(400).json({ status: "error", message: `File peserta ${i} tidak valid` });
        }

        const safeName = `${nama.replace(/[^a-z0-9]/gi, "_").toLowerCase()}${ext}`;
        const finalPath = path.join(uploadDir, safeName);
        fs.renameSync(fileField.filepath, finalPath);

        dataPembeli.push({ nama, asal_sekolah: asal, no_wa, email, kartu_pelajar: safeName });
      }

      // Simpan ke PostgreSQL (Neon)
      const client = await pool.connect();
      const result = await client.query(
        "INSERT INTO tiket_pembelian (data_pembeli, jumlah_tiket, total_harga, kode_unik) VALUES ($1,$2,$3,$4) RETURNING id",
        [JSON.stringify(dataPembeli), jumlah_tiket, total_harga, ""]
      );

      const lastId = result.rows[0].id;
      const kode_unik = `#TOUCH15${lastId.toString().padStart(3, "0")}`;
      await client.query("UPDATE tiket_pembelian SET kode_unik=$1 WHERE id=$2", [kode_unik, lastId]);
      client.release();

      return res.status(200).json({ status: "success", kode_unik });
    } catch (error) {
      return res.status(500).json({ status: "error", message: error.message });
    }
  });
}
