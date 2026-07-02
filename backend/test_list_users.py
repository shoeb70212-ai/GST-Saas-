import asyncio, os
from dotenv import load_dotenv
from supabase import create_async_client

load_dotenv()

async def test():
    client = await create_async_client(
        os.getenv('VITE_SUPABASE_URL'), 
        os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    )
    users = await client.auth.admin.list_users()
    print("Type of users:", type(users))
    print("Attributes:", dir(users))
    if hasattr(users, 'users'):
        print("Users count (users property):", len(users.users))
    elif isinstance(users, list):
        print("Users count (list):", len(users))
        if len(users) > 0:
            print("First user email:", getattr(users[0], 'email', 'N/A'))
    else:
        print("Unknown format")

asyncio.run(test())
