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

/**
 * RESET: Delete all transactions and category cache for a user.
 */
async function resetUserData(telegramId) {
  // 1. Delete transactions
  const { error: txError } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', telegramId);

  if (txError) throw txError;

  // 2. Clear category cache (so they can re-teach the AI)
  const { error: cacheError } = await supabase
    .from('category_cache')
    .delete()
    .eq('user_id', telegramId);

  if (cacheError) throw cacheError;

  // Note: We don't delete categories (profiles.categories) or profiles
  // We want to keep their custom categories, just wipe the history.
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

/**
 * Delete a category and clean up its cache.
 */
async function deleteCategory(telegramId, categoryName) {
  // 1. Delete category
  const { error: catError } = await supabase
    .from('user_categories')
    .delete()
    .eq('user_id', telegramId)
    .eq('name', categoryName);

  if (catError) throw catError;

  // 2. Clear related cache keyword→category mapping
  const { error: cacheError } = await supabase
    .from('category_cache')
    .delete()
    .eq('user_id', telegramId)
    .eq('category', categoryName);

  if (cacheError) throw cacheError;

  return true;
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

/**
 * Delete a specific keyword mapping from cache (Unlearn).
 */
async function unlearnKeyword(telegramId, keyword) {
  const { error } = await supabase
    .from('category_cache')
    .delete()
    .eq('user_id', telegramId)
    .eq('keyword', keyword.toLowerCase().trim());

  if (error) throw error;
}

/**
 * Get all cached keywords for a user (for smart matching).
 */
async function listAllCache(telegramId) {
  const { data, error } = await supabase
    .from('category_cache')
    .select('keyword, category')
    .eq('user_id', telegramId);

  if (error) throw error;
  return data || [];
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

/**
 * Delete the most recent transaction for a user.
 */
async function deleteLastTransaction(telegramId) {
  // Find the last ID
  const { data: last, error: findError } = await supabase
    .from('transactions')
    .select('id, item, amount, category')
    .eq('user_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (findError) {
    if (findError.code === 'PGRST116') return null;
    throw findError;
  }

  // Delete it
  const { error: deleteError } = await supabase
    .from('transactions')
    .delete()
    .eq('id', last.id);

  if (deleteError) throw deleteError;
  return last;
}

/**
 * Reset all transactions for the current month.
 */
async function resetMonthlyTransactions(telegramId) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', telegramId)
    .gte('created_at', startOfMonth);

  if (error) throw error;
  return true;
}

module.exports = {
  supabase,
  upsertProfile,
  getProfile,
  setBudget,
  resetUserData,
  seedDefaultCategories,
  addCategory,
  listCategories,
  deleteCategory,
  getCachedCategory,
  setCachedCategory,
  unlearnKeyword,
  listAllCache,
  addTransaction,
  getMonthlyTotal,
  getMonthlyTransactions,
  getDailyTransactions,
  deleteLastTransaction,
  resetMonthlyTransactions,
  DEFAULT_CATEGORIES,
};
