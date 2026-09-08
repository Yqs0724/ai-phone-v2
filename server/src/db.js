// 数据访问层：全项目唯一碰 SQL 的地方（架构纪律：SQL 不出这一层）
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

export const db = new DatabaseSync(path.join(dataDir, 'app.db'))

// v2 全部表结构一次建齐：v1 四张表 + v2 新增 materials（弹药库）
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,              -- 'user' | 'assistant'
    content TEXT NOT NULL,
    is_proactive INTEGER DEFAULT 0,  -- 1 = AI 主动开口
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fact TEXT NOT NULL,
    importance INTEGER NOT NULL,     -- 1-10，衰减与取舍的依据
    last_used_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,            -- persona / worldbook / avatar ...
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS anniversaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,              -- 'MM-DD'
    yearly INTEGER DEFAULT 1,        -- 1 = 每年循环
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_text TEXT NOT NULL,          -- 原始粘贴内容
    type TEXT NOT NULL,              -- '剧情点子' | '角色卡' | 'prompt技巧'
    title TEXT,                      -- LLM 生成的一句话标题
    tags TEXT,                       -- JSON 字符串：{personaTypes:[], stage:'', flavors:[]}
    created_at INTEGER NOT NULL
  );
`)
