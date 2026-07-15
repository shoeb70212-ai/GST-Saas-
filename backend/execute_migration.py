import psycopg2
import os

def run_migration():
    try:
        conn = psycopg2.connect('postgresql://postgres:postgres@localhost:54322/postgres')
        conn.autocommit = True
        cur = conn.cursor()
        
        migration_file = os.path.join('..', 'migration_phase31_db_optimizations.sql')
        with open(migration_file, 'r') as f:
            sql = f.read()
            
        cur.execute(sql)
        print("Phase 31 Migration executed successfully!")
        
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    run_migration()
