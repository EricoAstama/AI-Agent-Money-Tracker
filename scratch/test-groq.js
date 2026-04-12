require('dotenv').config();
const ai = require('../src/ai');

(async () => {
  const cats = ['Pangan', 'Jajan', 'Transportasi', 'Kebutuhan & Tech', 'Sosial & Keluarga', 'Lain-lain'];
  const tests = [
    'service motor', 'nasi uduk', 'pulsa', 'skincare', 'bensin', 
    'kopi susu', 'nasi goreng', 'belanja sayur', 'grab ojek', 
    'netflix', 'kondangan', 'sepatu', 'teh manis'
  ];
  
  for (const t of tests) {
    const r = await ai.classifyCategory(t, cats);
    const icon = r ? '✅' : '❓';
    console.log(`${icon} "${t}" -> ${r || 'akan minta pilih tombol'}`);
  }
})();
