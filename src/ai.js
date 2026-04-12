const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

/**
 * Ask Gemini to classify `item` into one of the user's categories.
 * Returns the matched category name (string) or null if API fails.
 */
async function classifyCategory(item, categories) {
  const categoryList = categories.map((c, i) => `${i + 1}. ${c}`).join('\n');

  const prompt = `Kamu adalah asisten keuangan pribadi yang cerdas. Tugasmu adalah mengkategorikan item pengeluaran ke dalam salah satu kategori yang tersedia bagi pengguna ini.

Daftar Kategori:
${categoryList}

Definisi Kategori (Hanya gunakan jika nama kategori sesuai):
- Pangan: Makanan berat, makan harian (nasi, lauk), bahan pokok (beras, minyak), atau belanja dapur.
- Jajan: Camilan, kopi, minuman ringan, dessert, atau makan santai yang bukan kebutuhan pokok.
- Transportasi: Bensin, ojek online, parkir, tiket bus/kereta, servis kendaraan.
- Kebutuhan & Tech: Langganan aplikasi, pulsa/kuota, perkakas, barang elektronik, sabun/sampo.
- Sosial & Keluarga: Uang jajan anak, sedekah, kado, kondangan.
- Lain-lain: HANYA jika benar-benar tidak bisa dikategorikan ke kategori manapun.

Item pengeluaran: "${item}"

Instruksi:
- Pilih SATU kategori yang paling cocok secara semantik.
- Jawab HANYA dengan nama kategori persis seperti di daftar (case-sensitive), tanpa penjelasan tambahan.`;

  try {
    const result = await model.generateContent(prompt);
    let rawResponse = result.response.text().trim();
    console.log(`🤖 Gemini response: "${rawResponse}"`);

    // Clean response (remove markdown, quotes, and punctuation)
    let cleaned = rawResponse.replace(/[*"'`._]/g, '').trim();
    
    // Attempt to find a match (case-insensitive)
    const matched = categories.find(
      (c) => c.toLowerCase() === cleaned.toLowerCase() || 
             cleaned.toLowerCase().includes(c.toLowerCase())
    );

    if (matched) {
      console.log(`✅ Matched: ${matched}`);
      return matched;
    }

    // Fallback logic
    const fallback = categories.find(c => c === 'Lain-lain') || categories[0];
    console.log(`⚠️ No exact match for "${cleaned}". Falling back to: ${fallback}`);
    return fallback;
  } catch (error) {
    console.error('❌ Gemini API error:', error.message);
    // Return null so the caller knows AI failed (not a bad categorization)
    return null;
  }
}

module.exports = { classifyCategory };
