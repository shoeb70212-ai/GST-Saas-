import os
import httpx
from http_client import get_shared_client
import base64
import json
import asyncio
import io
import uuid
import logging
import fitz  # PyMuPDF
from fastapi import HTTPException
from pydantic import BaseModel
from typing import Optional
from supabase import create_async_client
from PIL import Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger(__name__)

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

# We reuse the existing extraction function from main
# to avoid circular imports, import run_ai_extraction where used

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

META_ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN")
META_PHONE_NUMBER_ID = os.getenv("META_PHONE_NUMBER_ID")

_wa_processing_semaphore = asyncio.Semaphore(4)

async def send_whatsapp_message(to_number: str, text: str):
    """
    Sends a simple text message back to the user via Meta Cloud API.
    """
    url = f"https://graph.facebook.com/v19.0/{META_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {META_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "text",
        "text": {"body": text}
    }
    
    async with get_shared_client() as client:
        resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code not in (200, 201):
            logger.warning(f"Failed to send WA message: {resp.text}")

async def download_whatsapp_media(media_id: str) -> bytes:
    headers = {"Authorization": f"Bearer {META_ACCESS_TOKEN}"}
    async with get_shared_client() as client:
        url_resp = await client.get(
            f"https://graph.facebook.com/v19.0/{media_id}",
            headers=headers
        )
        if url_resp.status_code != 200:
            raise Exception(f"Failed to get media URL: {url_resp.text}")
            
        media_url = url_resp.json().get("url")
        if not media_url:
            raise Exception("No media URL found in Meta response.")
            
        media_resp = await client.get(media_url, headers=headers)
        if media_resp.status_code != 200:
            raise Exception(f"Failed to download media bytes: {media_resp.text}")
            
        return media_resp.content

async def compress_image(content_bytes: bytes) -> bytes:
    try:
        img = Image.open(io.BytesIO(content_bytes))
        img = ImageOps.exif_transpose(img)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Resize if huge
        if img.width > 2000 or img.height > 2000:
            img.thumbnail((2000, 2000), Image.Resampling.LANCZOS)
            
        output = io.BytesIO()
        img.save(output, format="JPEG", quality=75, optimize=True)
        return output.getvalue()
    except UnidentifiedImageError:
        raise ValueError("Unsupported or corrupted image format.")

async def process_whatsapp_message_bg(message_data: dict):
    """
    Background worker that handles the actual processing of an incoming WhatsApp message.
    """
    async with _wa_processing_semaphore:
        try:
            from_number = message_data.get("from")
            message_type = message_data.get("type")
            
            SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)
            sc = await create_async_client(SUPABASE_URL, SERVICE_ROLE)
            
            profile_resp = await sc.table("profiles").select("id, active_whatsapp_client_id, tally_ledgers, active_org_id").eq("whatsapp_number", from_number).execute()
            if not profile_resp.data or len(profile_resp.data) == 0:
                await send_whatsapp_message(from_number, "⚠️ This phone number is not linked to any KhataLens account. Please add your number in Settings.")
                return
                
            user_profile = profile_resp.data[0]
            user_id = user_profile.get("id")
            client_id = user_profile.get("active_whatsapp_client_id")
            tally_ledgers = user_profile.get("tally_ledgers")
            active_org_id = user_profile.get("active_org_id")
            
            if not client_id:
                await send_whatsapp_message(from_number, "⚠️ You don't have an active client selected for WhatsApp ingestion. Please set one in Settings.")
                return
            
            # 1. Wallet Abuse Check — fetch credits from organization (consistent with decrement_credits RPC)
            credits = 0
            if active_org_id:
                org_resp = await sc.table("organizations").select("credits").eq("id", active_org_id).execute()
                if org_resp.data:
                    credits = org_resp.data[0].get("credits", 0)
            else:
                # Fallback: find org where user is owner
                org_resp = await sc.table("organizations").select("credits").eq("owner_id", user_id).execute()
                if org_resp.data:
                    credits = org_resp.data[0].get("credits", 0)
            
            if credits <= 0:
                await send_whatsapp_message(from_number, "💳 You have insufficient credits. Please recharge your wallet to process invoices via WhatsApp.")
                return

            # 2. Conversational State Machine for Passwords
            if message_type == "text":
                text_body = message_data.get("text", {}).get("body", "").strip()
                
                # Check for active pending file within last 24h (stale session cleanup)
                # Note: Supabase JS syntax in python client requires raw string filter for dates, or just filter in python.
                pending_resp = await sc.table("whatsapp_pending_files").select("*").eq("whatsapp_number", from_number).execute()
                
                # Filter in Python for simplicity to avoid timezone SQL issues
                import datetime
                valid_pending = None
                now = datetime.datetime.now(datetime.timezone.utc)
                for p in pending_resp.data:
                    dt = datetime.datetime.fromisoformat(p["created_at"].replace("Z", "+00:00"))
                    if (now - dt).total_seconds() < 86400:
                        valid_pending = p
                        break
                        
                if not valid_pending:
                    await send_whatsapp_message(from_number, "❌ Please send an Image or PDF document.")
                    return
                
                pending_id = valid_pending["id"]
                media_id = valid_pending["media_id"]
                mime_type = valid_pending["mime_type"]
                attempts = valid_pending["attempts"]
                
                await send_whatsapp_message(from_number, "⏳ Testing password...")
                try:
                    content_bytes = await download_whatsapp_media(media_id)
                    doc = fitz.open(stream=content_bytes, filetype="pdf")
                    if doc.authenticate(text_body):
                        from utils import remove_pdf_password_if_present
                        content_bytes = remove_pdf_password_if_present(content_bytes, text_body)
                        await sc.table("whatsapp_pending_files").delete().eq("id", pending_id).execute()
                    else:
                        new_attempts = attempts + 1
                        if new_attempts >= 3:
                            await sc.table("whatsapp_pending_files").delete().eq("id", pending_id).execute()
                            await send_whatsapp_message(from_number, "❌ Too many incorrect attempts. The file processing has been cancelled. Please remove the password from your PDF and upload it again.")
                        else:
                            await sc.table("whatsapp_pending_files").update({"attempts": new_attempts}).eq("id", pending_id).execute()
                            await send_whatsapp_message(from_number, "❌ Incorrect password. Please try again.")
                        return
                except Exception as e:
                    await send_whatsapp_message(from_number, "❌ Failed to process the password-protected PDF.")
                    return
            else:
                # 3. Normal File Processing
                if message_type == "image":
                    media_id = message_data.get("image", {}).get("id")
                    mime_type = message_data.get("image", {}).get("mime_type", "image/jpeg")
                elif message_type == "document":
                    media_id = message_data.get("document", {}).get("id")
                    mime_type = message_data.get("document", {}).get("mime_type", "application/pdf")
                else:
                    await send_whatsapp_message(from_number, "❌ Please send an Image or PDF document.")
                    return

                if not media_id:
                    return

                allowed_mimes = ["image/jpeg", "image/png", "image/heic", "application/pdf"]
                if mime_type not in allowed_mimes:
                    await send_whatsapp_message(from_number, "❌ Unsupported file type. Please send a PDF, JPEG, PNG, or HEIC.")
                    return

                await send_whatsapp_message(from_number, "⏳ Received! Processing your invoice...")
                content_bytes = await download_whatsapp_media(media_id)

                if mime_type == "application/pdf":
                    # 25MB check
                    if len(content_bytes) > 25 * 1024 * 1024:
                        await send_whatsapp_message(from_number, "❌ PDF is too large (Max 25MB).")
                        return
                    
                    try:
                        doc = fitz.open(stream=content_bytes, filetype="pdf")
                        if doc.needs_pass:
                            await sc.table("whatsapp_pending_files").insert({
                                "user_id": user_id,
                                "whatsapp_number": from_number,
                                "media_id": media_id,
                                "mime_type": mime_type,
                                "attempts": 0
                            }).execute()
                            await send_whatsapp_message(from_number, "🔒 This PDF is password protected. Please reply with the password to unlock it.")
                            return
                    except Exception:
                        await send_whatsapp_message(from_number, "❌ The PDF file appears to be corrupted.")
                        return
                else:
                    # Compression & Resize
                    try:
                        content_bytes = await compress_image(content_bytes)
                        mime_type = "image/jpeg"
                    except ValueError as ve:
                        await send_whatsapp_message(from_number, f"❌ {str(ve)}")
                        return

            # 4. Upload to Supabase Storage
            file_url = None
            try:
                ext = "pdf" if mime_type == "application/pdf" else "jpg"
                file_path = f"{client_id}/wa_{uuid.uuid4().hex}.{ext}"
                
                # We need to run sync code in thread, but supabase-py storage might be sync. 
                # According to standard supabase python client, storage methods are synchronous.
                # It's better to wrap it or just call it directly if it supports async (it depends on version).
                # Assuming sync for storage:
                res = sc.storage.from_("invoices").upload(file_path, content_bytes, {"content-type": mime_type})
                file_url = sc.storage.from_("invoices").get_public_url(file_path)
            except Exception as e:
                logger.error(f"Storage upload failed: {e}")
            
            # 4.5 Deduct Credit BEFORE AI Extraction
            rpc_resp = await sc.rpc("decrement_credits", {
                "user_id_param": user_id, 
                "amount": 1,
                "task_type_param": "whatsapp_scan",
                "file_name_param": f"WhatsApp_{media_id}",
                "tokens_used_param": 0
            }).execute()
            
            if rpc_resp.data == -1:
                await send_whatsapp_message(
                    from_number,
                    "⚠️ *Insufficient Credits*\nYour organization has run out of AI credits. Please recharge your wallet via the web dashboard to process this invoice."
                )
                return

            # 5. AI Extraction
            from main import run_ai_extraction
            try:
                data_dict, tokens = await run_ai_extraction(content_bytes, mime_type, tally_ledgers)
            except Exception as ai_e:
                # Refund on failure
                await sc.rpc("refund_credits", {
                    "user_id_param": user_id,
                    "amount": 1
                }).execute()
                raise ai_e
            
            state = data_dict.get("Extraction_State")
            if state == "needs_retry":
                await send_whatsapp_message(
                    from_number,
                    "❌ The image was blurry or the AI could not extract the required fields. Please re-send a clearer photo or a PDF."
                )
                return

            # 6. Save to DB
            invoice_data = {
                "user_id": user_id,
                "client_id": client_id,
                "supplier_name": data_dict.get("Supplier_Name"),
                "supplier_gstin": data_dict.get("Supplier_GSTIN"),
                "invoice_number": data_dict.get("Invoice_Number"),
                "invoice_date": data_dict.get("Invoice_Date"),
                "total_amount": data_dict.get("Total_Amount"),
                "cgst_amount": data_dict.get("CGST_Amount"),
                "sgst_amount": data_dict.get("SGST_Amount"),
                "igst_amount": data_dict.get("IGST_Amount"),
                "cess_amount": data_dict.get("Cess_Amount"),
                "tax_rate": data_dict.get("Tax_Rate"),
                "expense_category": data_dict.get("Expense_Category"),
                "invoice_type": data_dict.get("Invoice_Type"),
                "reverse_charge_applicable": data_dict.get("Reverse_Charge_Applicable"),
                "confidence_score": data_dict.get("Confidence_Score", 0),
                "extraction_state": state,
                "flag_reason": data_dict.get("Flag_Reason"),
                "hsn_audit_warning": data_dict.get("HSN_Audit_Warning"),
                "file_url": file_url,
                "status": "pending_approval",
                "source": "whatsapp"
            }

            resp = await sc.table("invoices").insert(invoice_data).execute()
            if not resp.data:
                raise Exception("Failed to insert into DB")

            invoice_id = resp.data[0]["id"]
            
            # Save Line Items
            items = data_dict.get("Line_Items", [])
            if items:
                for item in items:
                    item["invoice_id"] = invoice_id
                await sc.table("invoice_line_items").insert(items).execute()

            # 8. Send Success Message
            supplier = data_dict.get("Supplier_Name", "Unknown Vendor")
            total = data_dict.get("Total_Amount", 0)
            await send_whatsapp_message(
                from_number,
                f"✅ Successfully extracted invoice from *{supplier}* for ₹{total}.\n\nIt has been saved to your dashboard."
            )

        except Exception as e:
            logger.error(f"Error in process_whatsapp_message_bg: {e}")
            try:
                from_number = message_data.get("from")
                if from_number:
                    await send_whatsapp_message(from_number, "⚠️ An internal error occurred while processing your invoice.")
            except:
                pass
