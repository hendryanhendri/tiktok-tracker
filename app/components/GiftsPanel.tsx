/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
export default function GiftsPanel({ gifts }: any) {
  return (
    <div className="bg-white/10 border border-white/10 rounded-2xl p-5 backdrop-blur-md shadow-md">
      <h3 className="font-semibold text-lg mb-3">🎁 Gifts</h3>
      <div className="h-56 overflow-y-auto text-sm space-y-2">
        {gifts.length ? (
          gifts.map((g: any, i: number) => (
            <div key={i} className="border-b border-white/10 pb-1 text-gray-300">
              <span className="text-blue-300 font-semibold">{g.user}</span> → {g.gift} ×{g.count}
            </div>
          ))
        ) : (
          <p className="text-gray-400">No gifts yet...</p>
        )}
      </div>
    </div>
  );
}
