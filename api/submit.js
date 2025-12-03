import { IncomingForm } from "formidable";
import { Pool } from "pg";

export const config = {
  api: { bodyParser: false }, // wajib untuk upload file
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  const form = new IncomingForm({
    multiples: true,
    keepExtensions: true,
    maxFileSize: 5 * 1024 * 1024, // 5 MB
    // HAPUS fileWriteStreamHandler
  });

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) {
        return res.status(400).json({
          status: "error",
          message: "Form parsing error: " + err.message,
        });
      }

      const jumlah = parseInt(fields.jumlah_tiket);
      if (!jumlah || jumlah < 1 || jumlah > 5) {
        return res.status(400).json({
          status: "error",
          message: "Jumlah tiket harus 1–5",
        });
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

        const file = files[`kartu_pelajar_${i}`];
        if (!file) {
          return res.status(400).json({
            status: "error",
            message: `Kartu pelajar peserta ${i} wajib diupload`,
          });
        }

        // Ambil buffer file (formidable v3+)
        const buffer = await file.toBuffer();
        const base64 = buffer.toString("base64");

        dataPeserta.push({
          nama,
          asal_sekolah: asal,
          no_wa,
          email,
          kartu_pelajar_base64: base64,
          file_type: file.mimetype,
        });
      }

      const client = await pool.connect();

      const insert = await client.query(
        `INSERT INTO tiket_pembelian (data_pembeli, jumlah_tiket, total_harga, kode_unik)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [JSON.stringify(dataPeserta), jumlah, total_harga, ""]
      );

      const lastId = insert.rows[0].id;

      const kode = `#TOUCH15${String(lastId).padStart(3, "0")}`;
      await client.query(
        `UPDATE tiket_pembelian SET kode_unik=$1 WHERE id=$2`,
        [kode, lastId]
      );

      client.release();

      return res.status(200).json({
        status: "success",
        kode_unik: kode,
      });

    } catch (error) {
      return res.status(500).json({
        status: "error",
        message: error.message,
      });
    }
  });
}
