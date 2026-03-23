import logging
import os
from typing import Optional, Tuple
import aiomysql

log = logging.getLogger("cnms.db")
_pool: Optional[aiomysql.Pool] = None

async def init_pool():
    global _pool
    _pool = await aiomysql.create_pool(
        unix_socket = "/var/lib/mysql/mysql.sock",
        user        = os.getenv("DB_USER",     "cnms_user"),
        password    = os.getenv("DB_PASSWORD", "cnms1234"),
        db          = os.getenv("DB_NAME",     "cnms_db"),
        charset     = "utf8mb4",
        cursorclass = aiomysql.DictCursor,
        autocommit  = True,
        minsize     = 2,
        maxsize     = 10,
    )
    log.info("[DB] Pool initialised via Unix socket")

async def close_pool():
    global _pool
    if _pool:
        _pool.close()
        await _pool.wait_closed()
        _pool = None

async def fetchall(sql: str, args: Tuple = ()) -> list:
    async with _pool.acquire() as conn:
        async with conn.cursor() as cur:
            try:
                await cur.execute(sql, args)
                return await cur.fetchall()
            except Exception as e:
                log.error(f"fetchall failed: {e}\nSQL: {sql}")
                raise

async def fetchone(sql: str, args: Tuple = ()) -> Optional[dict]:
    async with _pool.acquire() as conn:
        async with conn.cursor() as cur:
            try:
                await cur.execute(sql, args)
                return await cur.fetchone()
            except Exception as e:
                log.error(f"fetchone failed: {e}\nSQL: {sql}")
                raise

async def execute(sql: str, args: Tuple = ()) -> int:
    async with _pool.acquire() as conn:
        async with conn.cursor() as cur:
            try:
                await cur.execute(sql, args)
                return cur.lastrowid
            except Exception as e:
                log.error(f"execute failed: {e}\nSQL: {sql}")
                raise