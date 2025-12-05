// /api/submit.js
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import formidable from "formidable";
import fs from "fs";

// Disable body parsing agar bisa upload file
export const config = { api: { bodyParser: false } };

// ENV VARIABLES (buat di Vercel)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", message: "Method Not Allowed" });
  }

  try {
    const form = formidable({ multiples: true });

    const data = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve({ fields, files });
      });
    });

    const fields = data.fields;
    const files = data.files;

    const jumlah = parseInt(fields.jumlah_tiket);
    if (!jumlah || jumlah < 1 || jumlah > 5) {
      return res.status(400).json({ status: "error", message: "Jumlah tiket tidak valid" });
    }

    // Generate kode unik
    const kode_unik = "TO-" + Date.now().toString(36).toUpperCase();

    // Loop simpan peserta
    for (let i = 1; i <= jumlah; i++) {
      const nama = fields[`nama_${i}`];
      const sekolah = fields[`asal_sekolah_${i}`];
      const wa = fields[`no_wa_${i}`];
      const email = fields[`email_${i}`];
      const file = files[`kartu_pelajar_${i}`];

      if (!nama || !sekolah || !wa || !email || !file) {
        return res.status(400).json({ status: "error", message: `Data peserta ${i} tidak lengkap` });
      }

      // Upload ke Supabase Storage
      const rawFile = fs.readFileSync(file.filepath);
      const fileName = `${kode_unik}/peserta_${i}_${Date.now()}_${file.originalFilename}`;

      const upload = await supabase.storage
        .from("kartu-pelajar")
        .upload(fileName, rawFile, {
          contentType: file.mimetype
        });

      if (upload.error) {
        return res.status(500).json({ status: "error", message: upload.error.message });
      }

      const fileUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/kartu-pelajar/${fileName}`;

      // Simpan ke database
      await db.query(
        `INSERT INTO peserta_tryout
         (kode_unik, nomor_peserta, nama, asal_sekolah, no_wa, email, kartu_pelajar_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [kode_unik, i, nama, sekolah, wa, email, fileUrl]
      );
    }

    return res.status(200).json({
      status: "success",
      message: "Pendaftaran berhasil",
      kode_unik
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan server: " + err.message
    });
  }
}

fetch('/api/daftar', request)
  .then(async (res) => {
    const txt = await res.text();
    console.log("RAW RESPONSE:", txt); // <-- lihat ini
    try {
      return JSON.parse(txt);
    } catch {
      throw new Error("SERVER TIDAK MENGIRIM JSON");
    }
  })
  .catch(err => alert(err.message));
