const supabase = require("../config/supabase");

const CHUNK_SIZE = 100;

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// `.in()` filters travel in the URL, so large id lists are split into chunks.
async function selectByIds(table, column, ids, columns = "*") {
  const unique = [...new Set(ids)];
  const rows = [];
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE);
    rows.push(
      ...unwrap(await supabase.from(table).select(columns).in(column, chunk)),
    );
  }
  return rows;
}

module.exports = { unwrap, selectByIds };
