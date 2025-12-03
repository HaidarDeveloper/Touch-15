// submit.js (Next.js API route)
import { IncomingForm } from "formidable";
import { Pool } from "pg";
import fs from "fs";
import path from "path";

// Nonaktifkan bodyParser Next agar formidable bekerja
export const config = {
  api: { bodyParser: false },
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Helper: parse formidable jadi Promise
function parseForm(req, options = {}) {
  const form = new IncomingForm(options);
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

// Helper: pastikan kita dapatkan file single object (bukan array)
function pickFile(fileOrArray) {
  if (!fileOrArray) return null;
  if (Array.isArray(fileOrArray) && fileOrArray.length > 0) return fileOrArray[0];
  return fileOrArray;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  try {
    // parse form — formidable akan menyimpan file di temp dir
    const { fields, files } = await parseForm(req, {
      multiples: true,
      keepExtensions: true,
      maxFileSize: 5 * 1024 * 1024, // 5 MB
      // uploadDir: default -> system temp (bisa ditentukan jika mau)
    });

    const jumlah = parseInt(fields.jumlah_tiket);
    if (!jumlah || jumlah < 1 || jumlah > 5) {
      return res.status(400).json({ status: "error", message: "Jumlah tiket harus 1–5" });
    }

    const hargaTiket = 40000;
    let diskon = 0;
    if (jumlah >= 2) diskon = 0.025;
    if (jumlah >= 3) diskon = 0.05;
    if (jumlah >= 4) diskon = 0.075;
    if (jumlah === 5) diskon = 0.1;
    const total_harga = hargaTiket * jumlah * (1 - diskon);

    const dataPeserta = [];

    for (let i = 1; i <= jumlah; i++) {
      const nama = fields[`nama_${i}`];
      const asal = fields[`asal_sekolah_${i}`];
      const no_wa = fields[`no_wa_${i}`];
      const email = fields[`email_${i}`];

      if (!nama || !asal || !no_wa || !email) {
        return res.status(400).json({
          status: "error",
          message: `Data peserta ke-${i} tidak lengkap`,
        });
      }

      // dapatkan file (bisa array jika multiples)
      const rawFile = pickFile(files[`kartu_pelajar_${i}`]);
      if (!rawFile) {
        return res.status(400).json({
          status: "error",
          message: `Kartu pelajar peserta ${i} wajib diupload`,
        });
      }

      // formidable vX menyimpan filepath di .filepath atau .path (bergantung versi)
      const filepath = rawFile.filepath || rawFile.path || rawFile.filePath || rawFile.file;
      if (!filepath) {
        // Jika tidak ada path, kirim error yang informatif
        return res.status(500).json({
          status: "error",
          message: `Tidak bisa membaca file upload peserta ${i} (no filepath)`,
        });
      }

      // baca buffer dari file temp
      const buffer = await fs.promises.readFile(filepath);
      const base64 = buffer.toString("base64");

      // ambil mimetype/jenis file (property bisa berbeda: .mimetype, .type, .mime)
      const fileType = rawFile.mimetype || rawFile.type || rawFile.mime || "";

      dataPeserta.push({
        nama,
        asal_sekolah: asal,
        no_wa,
        email,
        kartu_pelajar_base64: base64,
        file_type: fileType,
        original_filename: rawFile.originalFilename || rawFile.name || path.basename(filepath),
      });

      // Optional: hapus temp file setelah dibaca (bersihkan)
      try {
        await fs.promises.unlink(filepath);
      } catch (e) {
        // kalau gagal hapus, tidak fatal — log saja
        console.warn("Gagal menghapus temp file:", filepath, e.message);
      }
    }

    // Simpan ke database (Neon/Postgres)
    const client = await pool.connect();
    try {
      const insert = await client.query(
        `INSERT INTO tiket_pembelian (data_pembeli, jumlah_tiket, total_harga, kode_unik)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [JSON.stringify(dataPeserta), jumlah, total_harga, ""]
      );

      const lastId = insert.rows[0].id;
      const kode = `#TOUCH15${String(lastId).padStart(3, "0")}`;

      await client.query(`UPDATE tiket_pembelian SET kode_unik=$1 WHERE id=$2`, [kode, lastId]);

      return res.status(200).json({ status: "success", kode_unik: kode });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
}
