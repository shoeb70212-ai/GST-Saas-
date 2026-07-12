import os
import httpx
from datetime import datetime, timezone
import random

# For production, replace this with a real provider (e.g. Cashfree/Razorpay)
# Setting up structure for AppyFlow or RapidAPI
GSTIN_API_KEY = os.getenv("GSTIN_API_KEY", "mock_key")
GSTIN_API_URL = os.getenv("GSTIN_API_URL", "https://api.mockgstin.com/verify")

async def verify_gstin(supabase_client, gstin: str) -> str:
    """
    Verifies a GSTIN's active status.
    
    Architecture:
    This function implements a caching layer to avoid paying per-verification 
    API costs for repeat vendors. It first checks the `gstin_cache` Supabase table.
    If a cache miss occurs, it hits the external API (like AppyFlow), retrieves 
    the Live status (Active/Cancelled), and caches it for future invoices from 
    that same vendor.
    
    Returns: 'Active', 'Cancelled', 'Invalid', or 'Unknown'
    """
    if not gstin or len(gstin) != 15:
        return "Invalid"
        
    try:
        # 1. Check Cache
        cache_resp = await supabase_client.table("gstin_cache").select("*").eq("gstin", gstin).execute()
        if cache_resp.data:
            record = cache_resp.data[0]
            last_verified = record.get("last_verified_at")
            # If we want to check if it's older than 30 days, we could do it here.
            # For now, if it's in cache, we trust it.
            return record.get("status", "Unknown")
            
        # 2. Cache Miss - Call External API
        if GSTIN_API_KEY == "mock_key":
            # Mock behavior: 90% Active, 10% Cancelled
            status = "Active" if random.random() > 0.1 else "Cancelled"
            legal_name = "Mock Company Pvt Ltd"
        else:
            # Example API Call (Adjust based on actual provider)
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{GSTIN_API_URL}/{gstin}", headers={"x-api-key": GSTIN_API_KEY})
                if resp.status_code == 200:
                    data = resp.json()
                    # Parse provider specific response
                    status = data.get("status", "Active")
                    legal_name = data.get("legal_name", "")
                else:
                    status = "Unknown"
                    legal_name = ""
                    
        # 3. Save to Cache
        if status in ["Active", "Cancelled"]:
            await supabase_client.table("gstin_cache").insert({
                "gstin": gstin,
                "status": status,
                "legal_name": legal_name,
                "last_verified_at": datetime.now(timezone.utc).isoformat()
            }).execute()
            
        return status
        
    except Exception as e:
        print(f"Error verifying GSTIN {gstin}: {e}")
        return "Unknown"
