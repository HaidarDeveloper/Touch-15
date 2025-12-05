import { createClient } from "@supabase/supabase-js";
import formidable from "formidable";
import fs from "fs";

export const config = { api: { bodyParser: false } };

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ status: "error", message: "Method not allowed" });

  const form = formidable({ multiples: true, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ status: "error", message: err.message });

    try {
      const pesertaCount = parseInt(fields.jumlah_tiket);
      const fileUrls = [];

      for (let i = 1; i <= pesertaCount; i++) {
        const file = files[`kartu_pelajar_${i}`];
        const dataFile = fs.readFileSync(file.filepath);
        const ext = file.originalFilename.split('.').pop();
        const fileName = `kartu_${Date.now()}_${i}.${ext}`;

        const { data, error: uploadError } = await supabase.storage
          .from("kartu_pelajar")
          .upload(fileName, dataFile);

        if (uploadError) throw uploadError;

        fileUrls.push(data.path);
      }

      const kodeUnik = `TOUCH-${Date.now()}`;
      const pesertaData = [];

      for (let i = 1; i <= pesertaCount; i++) {
        pesertaData.push({
          nama: fields[`nama_${i}`],
          asal_sekolah: fields[`asal_sekolah_${i}`],
          no_wa: fields[`no_wa_${i}`],
          email: fields[`email_${i}`],
          kartu_url: fileUrls[i-1],
          kode_unik: kodeUnik
        });
      }

      const { error: dbError } = await supabase.from("peserta").insert(pesertaData);
      if (dbError) throw dbError;

      res.status(200).json({ status: "success", kode_unik: kodeUnik });
    } catch (e) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });
}
