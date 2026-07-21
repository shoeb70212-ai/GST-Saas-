"""
Server-side credit cost constants.

Keep these in sync with product pricing copy on the frontend.
Prefer importing from here over scattering magic numbers in route handlers.
"""

# Single invoice scan (authenticated /api/scan-invoice)
INVOICE_SCAN = 1

# Public client portal upload
PUBLIC_UPLOAD = 1

# Batch ZIP: one credit per queued file
BATCH_PER_FILE = 1
