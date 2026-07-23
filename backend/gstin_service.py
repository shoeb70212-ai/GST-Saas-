import os
import httpx
from http_client import get_shared_client
import logging
from datetime import datetime, timezone, timedelta
import random

from ops_log import log_ops_event, ops_sample_rate

logger = logging.getLogger(__name__)

# AppyFlow configuration
GSTIN_API_KEY = os.getenv("GSTIN_API_KEY", "mock_key")
# Defaulting to AppyFlow's standard URL
GSTIN_API_URL = os.getenv("GSTIN_API_URL", "https://appyflow.in/api/verifyGST")


def _gstin_suffix(gstin: str) -> str:
    """Last 4 chars only — never log full GSTIN in ops messages."""
    g = (gstin or "").strip()
    return g[-4:] if len(g) >= 4 else "????"


async def verify_gstin(supabase_client, gstin: str) -> str:
    """
    Verifies a GSTIN's active status via AppyFlow with 30-day caching.
    Returns: 'Active', 'Cancelled', 'Invalid', or 'Unknown'
    """
    if not gstin or len(gstin) != 15:
        return "Invalid"

    suffix = _gstin_suffix(gstin)

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
                        status = record.get("status", "Unknown")
                        # Sample cache hits to avoid ops flood
                        rate = ops_sample_rate()
                        if rate >= 1.0 or random.random() <= rate:
                            await log_ops_event(
                                severity="info",
                                event_type="gstin_cache_hit",
                                message=f"GSTIN cache hit …{suffix}",
                                meta={"cache": "hit", "status": status, "gstin_suffix": suffix},
                                supabase_client=supabase_client,
                            )
                        return status
                except ValueError:
                    pass  # Invalid date format, force a cache miss

        await log_ops_event(
            severity="info",
            event_type="gstin_cache_miss",
            message=f"GSTIN cache miss …{suffix}",
            meta={"cache": "miss" if not cache_resp.data else "expired", "gstin_suffix": suffix},
            supabase_client=supabase_client,
        )

        # 2. Cache Miss or Expired - Call External API
        if GSTIN_API_KEY == "mock_key":
            # Mock behavior: 90% Active, 10% Cancelled
            status = "Active" if random.random() > 0.1 else "Cancelled"
            legal_name = "Mock Company Pvt Ltd"
        else:
            # AppyFlow API Call with 5-second request timeout
            async with get_shared_client() as client:
                resp = await client.get(
                    f"{GSTIN_API_URL}?gstNo={gstin}&key={GSTIN_API_KEY}",
                    timeout=5.0,
                )
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

        if status == "Unknown":
            await log_ops_event(
                severity="warning",
                event_type="gstin_verify_failure",
                message=f"GSTIN verify returned Unknown …{suffix}",
                meta={"cache": "miss", "status": "Unknown", "gstin_suffix": suffix},
                supabase_client=supabase_client,
            )

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
        logger.warning(f"AppyFlow API timeout for …{suffix}")
        await log_ops_event(
            severity="error",
            event_type="gstin_verify_failure",
            message=f"GSTIN API timeout …{suffix}",
            meta={"cache": "miss", "status": "timeout", "gstin_suffix": suffix},
            supabase_client=supabase_client,
        )
        return "Unknown"
    except Exception as e:
        logger.error(f"Error verifying GSTIN …{suffix}: {e}")
        await log_ops_event(
            severity="error",
            event_type="gstin_verify_failure",
            message=f"GSTIN verify exception …{suffix}",
            meta={"cache": "miss", "status": "exception", "gstin_suffix": suffix},
            supabase_client=supabase_client,
        )
        return "Unknown"
