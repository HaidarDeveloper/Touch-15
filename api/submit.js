import formidable from "formidable";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import pkg from "pg";
const { Pool } = pkg;

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
    const form = new formidable.IncomingForm({ keepExtensions: true });

    const data = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve({ fields, files });
      });
    });

    const { fields, files } = data;

    // Ambil file upload
    const file = files.kartu_pelajar?.[0];

    let uploadedFileUrl = null;

    // Jika ada file, upload ke Supabase Storage
    if (file) {
      const fileBuffer = fs.readFileSync(file.filepath);
      const fileExt = file.originalFilename.split(".").pop();
      const newName = `kartu/${Date.now()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(newName, fileBuffer, {
          contentType: file.mimetype,
        });

      if (uploadError) {
        console.log(uploadError);
        throw new Error("Upload gagal");
      }

      const { data: publicUrl } = supabase.storage
        .from("uploads")
        .getPublicUrl(newName);

      uploadedFileUrl = publicUrl.publicUrl;
    }

    // SIMPAN KE NEON
    const query = `
      INSERT INTO pendaftaran (nama, kelas, sekolah, kartu_url)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;

    const result = await pool.query(query, [
      fields.nama,
      fields.kelas,
      fields.sekolah,
      uploadedFileUrl,
    ]);

    return res.status(200).json({
      success: true,
      message: "Berhasil dikirim!",
      id: result.rows[0].id,
    });

  } catch (err) {
    console.log("SERVER ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
}
