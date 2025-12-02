<?php
$host = "localhost";
$user = "root"; // ubah jika username database kamu berbeda
$pass = "";     // ubah jika ada password
$db   = "touch15_db";

$conn = mysqli_connect($host, $user, $pass, $db);

if (!$conn) {
  die("Koneksi gagal: " . mysqli_connect_error());
}
?>
