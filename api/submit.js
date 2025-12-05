import formidable from "formidable";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import pkg from "pg";
const { Pool } = pkg;

// WAJIB: matikan bodyParser agar formidable bisa jalan
export const config = {
  api: {
    bodyParser: false,
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  try {
    // gunakan format baru formidable
    const form = formidable({
      multiples: true,
      keepExtensions: true,
    });

    const parseForm = () =>
      new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          resolve({ fields, files });
        });
      });

    const { fields, files } = await parseForm();

    // --- proses upload semua file ---
    let uploadedFiles = [];

    for (const key in files) {
      const f = files[key][0]; // ambil file pertama

      const fileBuffer = fs.readFileSync(f.filepath);
      const ext = f.originalFilename.split(".").pop();
      const newName = `kartu/${Date.now()}-${Math.random()
        .toString(36)
        .substring(2)}.${ext}`;

      const { data, error } = await supabase.storage
        .from("uploads")
        .upload(newName, fileBuffer, {
          contentType: f.mimetype,
        });

      if (error) throw new Error("Gagal upload ke Supabase");

      const publicUrl = supabase.storage
        .from("uploads")
        .getPublicUrl(newName).data.publicUrl;

      uploadedFiles.push(publicUrl);
    }

    // SIMPAN KE NEON
    const query = `
      INSERT INTO pendaftaran (data_fields, file_urls)
      VALUES ($1, $2)
      RETURNING id
    `;

    const result = await pool.query(query, [
      fields,
      uploadedFiles,
    ]);

    return res.status(200).json({
      status: "success",
      message: "Berhasil dikirim!",
      id: result.rows[0].id,
    });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: err.message,
    });
  }
}
