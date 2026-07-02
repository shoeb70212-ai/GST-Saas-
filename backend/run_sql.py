import psycopg2

def run_sql():
    try:
        conn = psycopg2.connect('postgresql://postgres:postgres@localhost:54322/postgres')
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS category TEXT;")
        print("Migration executed successfully!")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

run_sql()
