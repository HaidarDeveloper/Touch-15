import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import formidable from "formidable";
import fs from "fs";

// Vercel membutuhkan ini
export const config = {
  api: {
    bodyParser: false,
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const form = formidable({
      multiples: true,
      uploadDir: "/tmp", // WAJIB DI VERCEL
      keepExtensions: true,
    });

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve({ fields, files });
      });
    });

    const jumlah = parseInt(fields.jumlah_tiket);
    if (!jumlah) {
      return res.status(400).json({ error: "Jumlah tiket tidak valid" });
    }

    const kode_unik = "TO-" + Date.now().toString(36).toUpperCase();

    for (let i = 1; i <= jumlah; i++) {
      const file = files[`kartu_pelajar_${i}`];

      if (!file || !file.filepath) {
        return res.status(400).json({
          error: `File kartu pelajar peserta ${i} tidak ditemukan`,
        });
      }

      // Buat Blob dari file di /tmp
      const fileStream = fs.createReadStream(file.filepath);
      const fileStat = fs.statSync(file.filepath);

      const pesertaNama = fields[`nama_${i}`].trim().replace(/\s+/g, "_");
      const extension = file.originalFilename.split(".").pop();
      const fileName = `${kode_unik}/${pesertaNama}.${extension}`;

      const upload = await supabase.storage
        .from("kartu-pelajar")
        .upload(fileName, fileStream, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (upload.error) {
        console.error("UPLOAD ERROR:", upload.error);
        return res.status(500).json({ error: "Gagal upload ke Supabase" });
      }

      const fileUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/kartu-pelajar/${fileName}`;

      // Simpan ke Neon
      await db.query(
        `INSERT INTO peserta_tryout
        (kode_unik, nomor_peserta, nama, asal_sekolah, no_wa, email, kartu_pelajar_url)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          kode_unik,
          i,
          fields[`nama_${i}`],
          fields[`asal_sekolah_${i}`],
          fields[`no_wa_${i}`],
          fields[`email_${i}`],
          fileUrl,
        ]
      );
    }

    return res.status(200).json({
      status: "success",
      kode_unik,
    });
  } catch (e) {
    console.error("SERVER ERROR:", e);
    return res.status(500).json({ error: e.message });
  }
}
