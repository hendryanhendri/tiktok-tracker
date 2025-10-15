/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState } from "react";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function GiftEstimatorPage() {
  const [username, setUsername] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleCheck = async () => {
    if (!username) return alert("Masukkan username TikTok dulu!");
    setLoading(true);
    setData(null);

    try {
      const res = await fetch(`http://localhost:8000/estimate_gifts/${username}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
      alert("Gagal ambil data.");
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!data?.gifts) return;
    const csvContent =
      "data:text/csv;charset=utf-8," +
      ["Gift,Count,Total Coin,Total Rupiah"]
        .concat(
          data.gifts.map(
            (g: any) =>
              `${g.name},${g.count},${g.totalCoin},${g.totalRupiah.toLocaleString("id-ID")}`
          )
        )
        .join("\n");
    const encodedUri = encodeURI(csvContent);
    saveAs(encodedUri, `gift_estimation_${username}.csv`);
  };

  const exportPDF = () => {
    if (!data?.gifts) return;
    const doc = new jsPDF();
    doc.text(`TikTok Gift Estimation - @${username}`, 10, 10);
    autoTable(doc, {
      head: [["Gift", "Count", "Total Coin", "Total Rupiah"]],
      body: data.gifts.map((g: any) => [
        g.name,
        g.count,
        g.totalCoin,
        `Rp ${g.totalRupiah.toLocaleString("id-ID")}`,
      ]),
    });
    doc.save(`gift_estimation_${username}.pdf`);
  };

  return (
    
    <div className="text-white flex flex-col items-center mt-24 px-4">
      <h1 className="text-3xl font-bold mb-4">💰 Gift Income Estimator</h1>
      <p className="text-gray-300 mb-6 text-sm sm:text-base">
        Masukkan username TikTok untuk menghitung estimasi penghasilan dari gift.
      </p>

      <div className="flex gap-2 mb-6">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="contoh: josh"
          className="bg-white/10 border border-white/20 rounded-md px-4 py-2 outline-none"
        />
        <button
          onClick={handleCheck}
          disabled={loading}
          className="bg-pink-600 hover:bg-pink-500 rounded-md px-5 py-2"
        >
          {loading ? "⏳ Checking..." : "🔍 Estimate"}
        </button>
      </div>

      {data && !data.error && (
        <div className="bg-white/10 border border-white/10 rounded-2xl p-5 max-w-3xl w-full text-center">
          <h2 className="text-lg mb-2 font-semibold">@{data.username}</h2>
          <p className="text-gray-300 mb-4">
            {data.isLive
              ? `Sedang LIVE 🎥`
              : "Tidak live saat ini (data terakhir ditampilkan)."}
          </p>

          <h3 className="text-xl text-yellow-400 font-bold mb-3">
            💵 Total: Rp {data.totalRupiah.toLocaleString("id-ID")}
          </h3>

          <div className="flex justify-end gap-3 mb-4">
            <button
              onClick={exportCSV}
              className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded-md text-xs"
            >
              ⬇️ Export CSV
            </button>
            <button
              onClick={exportPDF}
              className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded-md text-xs"
            >
              📄 Export PDF
            </button>
          </div>

          {/* Tabel Gift */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-t border-white/10">
              <thead className="text-gray-300 border-b border-white/10">
                <tr>
                  <th className="py-2 text-left px-2">🎁 Gift</th>
                  <th className="py-2">Jumlah</th>
                  <th className="py-2">Coin</th>
                  <th className="py-2 text-right">Rupiah</th>
                </tr>
              </thead>
              <tbody>
                {data.gifts.map((g: any, i: number) => (
                  <tr key={i} className="border-b border-white/10">
                    <td className="py-1 px-2 text-left">{g.name}</td>
                    <td className="py-1">{g.count}</td>
                    <td className="py-1">{g.totalCoin}</td>
                    <td className="py-1 text-right">
                      Rp {g.totalRupiah.toLocaleString("id-ID")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Grafik */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-3">📊 Gift Breakdown</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.gifts}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip
                  formatter={(val: number) =>
                    `Rp ${val.toLocaleString("id-ID")}`
                  }
                />
                <Bar dataKey="totalRupiah" fill="#f472b6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
