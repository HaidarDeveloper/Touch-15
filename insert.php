<?php
// ======================
// insert.php aman
// ======================

include 'koneksi.php';

// Start output buffering untuk mencegah warning/notice muncul di response
ob_start();

// Set header JSON
header('Content-Type: application/json; charset=utf-8');

// Fungsi bantu kirim JSON dan exit
function sendResponse($status, $message, $extra = []) {
    ob_end_clean(); // Hapus output sebelumnya
    echo json_encode(array_merge(["status"=>$status,"message"=>$message], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $uploadDir = "uploads/";
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0777, true);

    $jumlah_tiket = intval($_POST['jumlah_tiket'] ?? 0);
    if ($jumlah_tiket < 1) sendResponse("error", "Jumlah tiket tidak valid");

    $harga_tiket = 40000;
    $diskon = 0;
    if ($jumlah_tiket >= 2) $diskon = 0.025;
    if ($jumlah_tiket >= 3) $diskon = 0.05;
    if ($jumlah_tiket >= 4) $diskon = 0.075;
    if ($jumlah_tiket == 5) $diskon = 0.1;

    $total_harga = $jumlah_tiket * $harga_tiket * (1 - $diskon);

    $dataPembeli = [];

    for ($i = 1; $i <= $jumlah_tiket; $i++) {
        $nama = trim($_POST["nama_$i"] ?? '');
        $asal = trim($_POST["asal_sekolah_$i"] ?? '');
        $wa = trim($_POST["no_wa_$i"] ?? '');
        $email = trim($_POST["email_$i"] ?? '');

        if (!$nama || !$asal || !$wa || !$email) {
            sendResponse("error", "Data peserta $i tidak lengkap");
        }

        $field = "kartu_pelajar_$i";

        if (!isset($_FILES[$field])) {
            sendResponse("error", "File kartu pelajar peserta $i tidak ditemukan");
        }

        $fileName = $_FILES[$field]["name"];
        $fileTmp = $_FILES[$field]["tmp_name"];
        $fileSize = $_FILES[$field]["size"];
        $fileErr = $_FILES[$field]["error"];

        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        $allowed = ['jpg','jpeg','png','pdf'];

        if ($fileErr !== 0 || !in_array($ext, $allowed) || $fileSize > 10*1024*1024) {
            sendResponse("error", "File peserta $i tidak valid");
        }

        $namaFile = preg_replace('/[^a-zA-Z0-9_-]/','_', strtolower($nama)) . "." . $ext;
        $target = $uploadDir . $namaFile;

        if (!move_uploaded_file($fileTmp, $target)) {
            sendResponse("error", "Gagal upload file peserta $i");
        }

        $dataPembeli[] = [
            "nama" => $nama,
            "asal_sekolah" => $asal,
            "no_wa" => $wa,
            "email" => $email,
            "kartu_pelajar" => $namaFile
        ];
    }

    // Simpan ke DB
    $jsonPembeli = mysqli_real_escape_string($conn, json_encode($dataPembeli, JSON_UNESCAPED_UNICODE));

    $q = "INSERT INTO tiket_pembelian (data_pembeli, jumlah_tiket, total_harga)
          VALUES ('$jsonPembeli','$jumlah_tiket','$total_harga')";
          
    if (!mysqli_query($conn, $q)) {
        sendResponse("error", "DB error: ".mysqli_error($conn));
    }

    $lastId = mysqli_insert_id($conn);
    $kodeUnik = "#TOUCH15" . str_pad($lastId, 3, "0", STR_PAD_LEFT);
    mysqli_query($conn, "UPDATE tiket_pembelian SET kode_unik='$kodeUnik' WHERE id=$lastId");

    // Kirim ke Google Sheets
    $sheetUrl = "https://script.google.com/macros/s/AKfycbwmvSFLZHCahvSfX2KtbZBn50Ii2osw5s36rgsBa2NNjRPy72KD-jvH3he2blZ8t3MGpg/exec";

    $payload = [
        "rekap" => $dataPembeli,
        "kode_unik" => $kodeUnik,
        "total_harga" => $total_harga
    ];

    $ch = curl_init($sheetUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/json"]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_TIMEOUT, 10); // timeout 10 detik
    $resp = curl_exec($ch);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        sendResponse("error", "Gagal kirim ke Google Sheets: $curlErr");
    }

    // cek apakah response Google Sheets valid JSON
    json_decode($resp);
    if (json_last_error() !== JSON_ERROR_NONE) {
        sendResponse("error", "Response Google Sheets bukan JSON: $resp");
    }

    // ✅ Semua berhasil
    sendResponse("success", "Data berhasil disimpan!", ["kode_unik"=>$kodeUnik]);

} catch (Exception $e) {
    sendResponse("error", $e->getMessage());
}
