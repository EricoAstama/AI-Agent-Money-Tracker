const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── Profile Operations ───────────────────────────────────────────

/**
 * Upsert user profile on /start. Returns the profile row.
 */
async function upsertProfile(telegramId, firstName) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { telegram_id: telegramId, first_name: firstName },
      { onConflict: 'telegram_id', ignoreDuplicates: true }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get profile by telegram_id.
 */
async function getProfile(telegramId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data;
}

/**
 * Update budget_limit for a user.
 */
async function setBudget(telegramId, amount) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ budget_limit: amount })
    .eq('telegram_id', telegramId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Category Operations ──────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  'Pangan',
  'Jajan',
  'Transportasi',
  'Kebutuhan & Tech',
  'Sosial & Keluarga',
  'Lain-lain',
];

/**
 * Seed default categories for a new user.
 */
async function seedDefaultCategories(telegramId) {
  const rows = DEFAULT_CATEGORIES.map((name) => ({
    user_id: telegramId,
    name,
  }));

  const { error } = await supabase.from('user_categories').insert(rows);
  if (error) throw error;
}

/**
 * Add a custom category for the user.
 */
async function addCategory(telegramId, categoryName) {
  const { data, error } = await supabase
    .from('user_categories')
    .insert({ user_id: telegramId, name: categoryName })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * List all categories for a user.
 */
async function listCategories(telegramId) {
  const { data, error } = await supabase
    .from('user_categories')
    .select('name')
    .eq('user_id', telegramId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data.map((r) => r.name);
}

// ─── Category Cache Operations ────────────────────────────────────

/**
 * Lookup cached category for a keyword + user.
 */
async function getCachedCategory(telegramId, keyword) {
  const { data, error } = await supabase
    .from('category_cache')
    .select('category')
    .eq('user_id', telegramId)
    .eq('keyword', keyword.toLowerCase().trim())
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data?.category || null;
}

/**
 * Store a keyword→category mapping in cache.
 */
async function setCachedCategory(telegramId, keyword, category) {
  const { error } = await supabase.from('category_cache').upsert(
    {
      user_id: telegramId,
      keyword: keyword.toLowerCase().trim(),
      category,
    },
    { onConflict: 'user_id,keyword' }
  );

  if (error) throw error;
}

// ─── Transaction Operations ───────────────────────────────────────

/**
 * Insert a new transaction.
 */
async function addTransaction(telegramId, item, amount, category) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: telegramId,
      item,
      amount,
      category,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get total spending for the current month.
 */
async function getMonthlyTotal(telegramId) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data, error } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', telegramId)
    .gte('created_at', startOfMonth);

  if (error) throw error;

  return data.reduce((sum, row) => sum + Number(row.amount), 0);
}

/**
 * Get all transactions for the current month (for report).
 */
async function getMonthlyTransactions(telegramId) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', telegramId)
    .gte('created_at', startOfMonth)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Get all transactions for today.
 */
async function getDailyTransactions(telegramId) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', telegramId)
    .gte('created_at', startOfDay)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

module.exports = {
  supabase,
  upsertProfile,
  getProfile,
  setBudget,
  seedDefaultCategories,
  addCategory,
  listCategories,
  getCachedCategory,
  setCachedCategory,
  addTransaction,
  getMonthlyTotal,
  getMonthlyTransactions,
  getDailyTransactions,
  DEFAULT_CATEGORIES,
};
