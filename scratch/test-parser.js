const { parseExpense } = require('../src/parser');

const tests = [
  "kopi 25k",
  "nasi goreng 15rebu",
  "bensin 50rb",
  "sewa kost 1,5jt",
  "beli mobil 250 juta",
  "investasi 1m",
  "saham 2,5 miliar",
  "sarapan 15.500",
  "gaji 15.000.000",
  "25k donasi",
  "1.5jt bayar utang"
];

console.log("--- Testing Parser ---");
tests.forEach(t => {
  const res = parseExpense(t);
  if (res) {
    console.log(`✅ Input: "${t}" -> Item: "${res.item}", Amount: ${res.amount}`);
  } else {
    console.log(`❌ Input: "${t}" -> FAILED`);
  }
});
