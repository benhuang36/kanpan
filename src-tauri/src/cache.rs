use crate::error::Result;
use crate::models::{Candle, InstitutionalDay, MarginDay, SplitEvent, SymbolInfo, Valuation};
use rusqlite::{params, Connection};

/// Initialise the schema. Idempotent.
pub fn init(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS symbols (
            stock_id          TEXT PRIMARY KEY,
            stock_name        TEXT NOT NULL,
            industry_category TEXT NOT NULL,
            market_type       TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS prices (
            stock_id TEXT NOT NULL,
            date     TEXT NOT NULL,
            open     REAL NOT NULL,
            high     REAL NOT NULL,
            low      REAL NOT NULL,
            close    REAL NOT NULL,
            volume   REAL NOT NULL,
            PRIMARY KEY (stock_id, date)
        );
        CREATE TABLE IF NOT EXISTS institutional (
            stock_id    TEXT NOT NULL,
            date        TEXT NOT NULL,
            foreign_net REAL NOT NULL,
            trust_net   REAL NOT NULL,
            dealer_net  REAL NOT NULL,
            PRIMARY KEY (stock_id, date)
        );
        CREATE TABLE IF NOT EXISTS per (
            stock_id       TEXT NOT NULL,
            date           TEXT NOT NULL,
            per            REAL NOT NULL,
            pbr            REAL NOT NULL,
            dividend_yield REAL NOT NULL,
            PRIMARY KEY (stock_id, date)
        );
        CREATE TABLE IF NOT EXISTS margin (
            stock_id       TEXT NOT NULL,
            date           TEXT NOT NULL,
            margin_balance REAL NOT NULL,
            margin_change  REAL NOT NULL,
            short_balance  REAL NOT NULL,
            short_change   REAL NOT NULL,
            PRIMARY KEY (stock_id, date)
        );
        CREATE TABLE IF NOT EXISTS splits (
            stock_id TEXT NOT NULL,
            date     TEXT NOT NULL,
            factor   REAL NOT NULL,
            PRIMARY KEY (stock_id, date)
        );
        CREATE TABLE IF NOT EXISTS dividends (
            stock_id TEXT NOT NULL,
            date     TEXT NOT NULL,
            factor   REAL NOT NULL,
            PRIMARY KEY (stock_id, date)
        );
        CREATE TABLE IF NOT EXISTS meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )?;
    Ok(())
}

// ---- meta ----

pub fn meta_get(conn: &Connection, key: &str) -> Result<Option<String>> {
    let v = conn
        .query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0))
        .ok();
    Ok(v)
}

pub fn meta_set(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO meta(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

// ---- symbols ----

pub fn symbols_count(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row("SELECT COUNT(*) FROM symbols", [], |r| r.get(0))?)
}

pub fn upsert_symbols(conn: &mut Connection, symbols: &[SymbolInfo]) -> Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO symbols(stock_id, stock_name, industry_category, market_type)
             VALUES(?1, ?2, ?3, ?4)
             ON CONFLICT(stock_id) DO UPDATE SET
                stock_name = excluded.stock_name,
                industry_category = excluded.industry_category,
                market_type = excluded.market_type",
        )?;
        for s in symbols {
            stmt.execute(params![s.stock_id, s.stock_name, s.industry_category, s.market_type])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Fuzzy search by stock id prefix or name substring. Prefix/id matches rank first.
pub fn search_symbols(conn: &Connection, query: &str, limit: usize) -> Result<Vec<SymbolInfo>> {
    let q = query.trim();
    let like_prefix = format!("{q}%");
    let like_contains = format!("%{q}%");
    let mut stmt = conn.prepare(
        "SELECT stock_id, stock_name, industry_category, market_type FROM symbols
         WHERE stock_id LIKE ?1 OR stock_name LIKE ?2
         ORDER BY
            CASE WHEN stock_id = ?3 THEN 0
                 WHEN stock_id LIKE ?1 THEN 1
                 WHEN stock_name LIKE ?1 THEN 2
                 ELSE 3 END,
            length(stock_id), stock_id
         LIMIT ?4",
    )?;
    let rows = stmt.query_map(
        params![like_prefix, like_contains, q, limit as i64],
        |r| {
            Ok(SymbolInfo {
                stock_id: r.get(0)?,
                stock_name: r.get(1)?,
                industry_category: r.get(2)?,
                market_type: r.get(3)?,
            })
        },
    )?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get_symbol(conn: &Connection, stock_id: &str) -> Result<Option<SymbolInfo>> {
    let v = conn
        .query_row(
            "SELECT stock_id, stock_name, industry_category, market_type FROM symbols WHERE stock_id = ?1",
            [stock_id],
            |r| {
                Ok(SymbolInfo {
                    stock_id: r.get(0)?,
                    stock_name: r.get(1)?,
                    industry_category: r.get(2)?,
                    market_type: r.get(3)?,
                })
            },
        )
        .ok();
    Ok(v)
}

// ---- prices ----

pub fn max_price_date(conn: &Connection, stock_id: &str) -> Result<Option<String>> {
    let v: Option<String> = conn.query_row(
        "SELECT MAX(date) FROM prices WHERE stock_id = ?1",
        [stock_id],
        |r| r.get(0),
    )?;
    Ok(v)
}

pub fn min_price_date(conn: &Connection, stock_id: &str) -> Result<Option<String>> {
    let v: Option<String> = conn.query_row(
        "SELECT MIN(date) FROM prices WHERE stock_id = ?1",
        [stock_id],
        |r| r.get(0),
    )?;
    Ok(v)
}

pub fn upsert_prices(conn: &mut Connection, stock_id: &str, candles: &[Candle]) -> Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO prices(stock_id, date, open, high, low, close, volume)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(stock_id, date) DO UPDATE SET
                open = excluded.open, high = excluded.high, low = excluded.low,
                close = excluded.close, volume = excluded.volume",
        )?;
        for c in candles {
            stmt.execute(params![stock_id, c.date, c.open, c.high, c.low, c.close, c.volume])?;
        }
    }
    tx.commit()?;
    Ok(())
}

pub fn get_prices(conn: &Connection, stock_id: &str, since: &str) -> Result<Vec<Candle>> {
    let mut stmt = conn.prepare(
        "SELECT date, open, high, low, close, volume FROM prices
         WHERE stock_id = ?1 AND date >= ?2 ORDER BY date ASC",
    )?;
    let rows = stmt.query_map(params![stock_id, since], |r| {
        Ok(Candle {
            date: r.get(0)?,
            open: r.get(1)?,
            high: r.get(2)?,
            low: r.get(3)?,
            close: r.get(4)?,
            volume: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

// ---- institutional ----

pub fn max_inst_date(conn: &Connection, stock_id: &str) -> Result<Option<String>> {
    let v: Option<String> = conn.query_row(
        "SELECT MAX(date) FROM institutional WHERE stock_id = ?1",
        [stock_id],
        |r| r.get(0),
    )?;
    Ok(v)
}

pub fn upsert_institutional(
    conn: &mut Connection,
    stock_id: &str,
    days: &[InstitutionalDay],
) -> Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO institutional(stock_id, date, foreign_net, trust_net, dealer_net)
             VALUES(?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(stock_id, date) DO UPDATE SET
                foreign_net = excluded.foreign_net,
                trust_net = excluded.trust_net,
                dealer_net = excluded.dealer_net",
        )?;
        for d in days {
            stmt.execute(params![stock_id, d.date, d.foreign_net, d.trust_net, d.dealer_net])?;
        }
    }
    tx.commit()?;
    Ok(())
}

pub fn get_institutional(
    conn: &Connection,
    stock_id: &str,
    since: &str,
) -> Result<Vec<InstitutionalDay>> {
    let mut stmt = conn.prepare(
        "SELECT date, foreign_net, trust_net, dealer_net FROM institutional
         WHERE stock_id = ?1 AND date >= ?2 ORDER BY date ASC",
    )?;
    let rows = stmt.query_map(params![stock_id, since], |r| {
        let foreign_net: f64 = r.get(1)?;
        let trust_net: f64 = r.get(2)?;
        let dealer_net: f64 = r.get(3)?;
        Ok(InstitutionalDay {
            date: r.get(0)?,
            foreign_net,
            trust_net,
            dealer_net,
            total_net: foreign_net + trust_net + dealer_net,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

// ---- valuation (PER/PBR/殖利率) ----

pub fn max_per_date(conn: &Connection, stock_id: &str) -> Result<Option<String>> {
    let v: Option<String> = conn.query_row(
        "SELECT MAX(date) FROM per WHERE stock_id = ?1",
        [stock_id],
        |r| r.get(0),
    )?;
    Ok(v)
}

pub fn upsert_per(conn: &mut Connection, stock_id: &str, rows: &[Valuation]) -> Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO per(stock_id, date, per, pbr, dividend_yield)
             VALUES(?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(stock_id, date) DO UPDATE SET
                per = excluded.per, pbr = excluded.pbr,
                dividend_yield = excluded.dividend_yield",
        )?;
        for v in rows {
            stmt.execute(params![stock_id, v.date, v.per, v.pbr, v.dividend_yield])?;
        }
    }
    tx.commit()?;
    Ok(())
}

pub fn latest_per(conn: &Connection, stock_id: &str) -> Result<Option<Valuation>> {
    let v = conn
        .query_row(
            "SELECT date, per, pbr, dividend_yield FROM per
             WHERE stock_id = ?1 ORDER BY date DESC LIMIT 1",
            [stock_id],
            |r| {
                Ok(Valuation {
                    date: r.get(0)?,
                    per: r.get(1)?,
                    pbr: r.get(2)?,
                    dividend_yield: r.get(3)?,
                })
            },
        )
        .ok();
    Ok(v)
}

// ---- margin (融資融券) ----

pub fn max_margin_date(conn: &Connection, stock_id: &str) -> Result<Option<String>> {
    let v: Option<String> = conn.query_row(
        "SELECT MAX(date) FROM margin WHERE stock_id = ?1",
        [stock_id],
        |r| r.get(0),
    )?;
    Ok(v)
}

pub fn upsert_margin(conn: &mut Connection, stock_id: &str, rows: &[MarginDay]) -> Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO margin(stock_id, date, margin_balance, margin_change, short_balance, short_change)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(stock_id, date) DO UPDATE SET
                margin_balance = excluded.margin_balance, margin_change = excluded.margin_change,
                short_balance = excluded.short_balance, short_change = excluded.short_change",
        )?;
        for m in rows {
            stmt.execute(params![
                stock_id,
                m.date,
                m.margin_balance,
                m.margin_change,
                m.short_balance,
                m.short_change
            ])?;
        }
    }
    tx.commit()?;
    Ok(())
}

// ---- splits ----

pub fn upsert_splits(conn: &mut Connection, stock_id: &str, splits: &[SplitEvent]) -> Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO splits(stock_id, date, factor) VALUES(?1, ?2, ?3)
             ON CONFLICT(stock_id, date) DO UPDATE SET factor = excluded.factor",
        )?;
        for s in splits {
            stmt.execute(params![stock_id, s.date, s.factor])?;
        }
    }
    tx.commit()?;
    Ok(())
}

pub fn get_splits(conn: &Connection, stock_id: &str, since: &str) -> Result<Vec<SplitEvent>> {
    let mut stmt = conn.prepare(
        "SELECT date, factor FROM splits WHERE stock_id = ?1 AND date >= ?2 ORDER BY date ASC",
    )?;
    let rows = stmt.query_map(params![stock_id, since], |r| {
        Ok(SplitEvent {
            date: r.get(0)?,
            factor: r.get(1)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

// ---- dividends (除權息 adjustment factors) ----

pub fn upsert_dividends(conn: &mut Connection, stock_id: &str, events: &[SplitEvent]) -> Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO dividends(stock_id, date, factor) VALUES(?1, ?2, ?3)
             ON CONFLICT(stock_id, date) DO UPDATE SET factor = excluded.factor",
        )?;
        for e in events {
            stmt.execute(params![stock_id, e.date, e.factor])?;
        }
    }
    tx.commit()?;
    Ok(())
}

pub fn get_dividends(conn: &Connection, stock_id: &str, since: &str) -> Result<Vec<SplitEvent>> {
    let mut stmt = conn.prepare(
        "SELECT date, factor FROM dividends WHERE stock_id = ?1 AND date >= ?2 ORDER BY date ASC",
    )?;
    let rows = stmt.query_map(params![stock_id, since], |r| {
        Ok(SplitEvent {
            date: r.get(0)?,
            factor: r.get(1)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get_margin(conn: &Connection, stock_id: &str, since: &str) -> Result<Vec<MarginDay>> {
    let mut stmt = conn.prepare(
        "SELECT date, margin_balance, margin_change, short_balance, short_change FROM margin
         WHERE stock_id = ?1 AND date >= ?2 ORDER BY date ASC",
    )?;
    let rows = stmt.query_map(params![stock_id, since], |r| {
        Ok(MarginDay {
            date: r.get(0)?,
            margin_balance: r.get(1)?,
            margin_change: r.get(2)?,
            short_balance: r.get(3)?,
            short_change: r.get(4)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}
