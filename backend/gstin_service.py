import os
import httpx
import logging
from datetime import datetime, timezone, timedelta
import random

logger = logging.getLogger(__name__)

# AppyFlow configuration
GSTIN_API_KEY = os.getenv("GSTIN_API_KEY", "mock_key")
# Defaulting to AppyFlow's standard URL
GSTIN_API_URL = os.getenv("GSTIN_API_URL", "https://appyflow.in/api/verifyGST")

async def verify_gstin(supabase_client, gstin: str) -> str:
    """
    Verifies a GSTIN's active status via AppyFlow with 30-day caching.
    Returns: 'Active', 'Cancelled', 'Invalid', or 'Unknown'
    """
    if not gstin or len(gstin) != 15:
        return "Invalid"
        
    try:
        # 1. Check Cache
        cache_resp = await supabase_client.table("gstin_cache").select("*").eq("gstin", gstin).execute()
        if cache_resp.data:
            record = cache_resp.data[0]
            last_verified_str = record.get("last_verified_at")
            
            # Check 30-day expiration
            if last_verified_str:
                # Handle ISO format with Z
                last_verified_str = last_verified_str.replace('Z', '+00:00')
                try:
                    last_verified = datetime.fromisoformat(last_verified_str)
                    if datetime.now(timezone.utc) - last_verified < timedelta(days=30):
                        return record.get("status", "Unknown")
                except ValueError:
                    pass # Invalid date format, force a cache miss
            
        # 2. Cache Miss or Expired - Call External API
        if GSTIN_API_KEY == "mock_key":
            # Mock behavior: 90% Active, 10% Cancelled
            status = "Active" if random.random() > 0.1 else "Cancelled"
            legal_name = "Mock Company Pvt Ltd"
        else:
            # AppyFlow API Call with 5-second timeout
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{GSTIN_API_URL}?gstNo={gstin}&key={GSTIN_API_KEY}")
                if resp.status_code == 200:
                    data = resp.json()
                    
                    if data.get("error") is False and "taxpayerInfo" in data:
                        info = data["taxpayerInfo"]
                        status = info.get("gstinStatus", "Active")
                        legal_name = info.get("tradeNam", "")
                    else:
                        status = "Unknown"
                        legal_name = ""
                else:
                    status = "Unknown"
                    legal_name = ""
                    
        # 3. Save or Update Cache
        if status in ["Active", "Cancelled"]:
            await supabase_client.table("gstin_cache").upsert({
                "gstin": gstin,
                "status": status,
                "legal_name": legal_name,
                "last_verified_at": datetime.now(timezone.utc).isoformat()
            }).execute()
            
        return status
        
    except httpx.TimeoutException:
        logger.warning(f"AppyFlow API timeout for {gstin}")
        return "Unknown"
    except Exception as e:
        logger.error(f"Error verifying GSTIN {gstin}: {e}")
        return "Unknown"
