# User Manual: Bank Reconciliation in KhataLens

Welcome to the KhataLens Bank Reconciliation guide! We know that matching thousands of bank statement rows to invoices is the most tedious part of GST filing. KhataLens automates this using a hybrid AI engine, while keeping **you** in complete control to ensure zero mistakes.

## Step 1: Uploading Bank Statements
1. Select your desired Client from the top navigation dropdown.
2. Click on **Bank Statements** in the left sidebar.
3. Drag and drop your client's PDF bank statement into the upload zone.
4. The system will display a "Processing..." badge. In the background, our AI is securely extracting every single transaction (date, description, withdrawals, deposits, and balances).
5. Once complete, you can click "View Details" to see the extracted transactions. Any rows with suspected math errors or unclear descriptions will be highlighted with a yellow "Review" badge.

## Step 2: Running the Auto-Matcher
1. Navigate to the **Reconcile** page via the left sidebar.
2. If you have unmatched invoices and unmatched bank statements, the system will automatically scan them.
3. **How it works:**
   - First, the system looks for exact amount matches (e.g., an invoice for ₹1,500 and a bank withdrawal for ₹1,500 on the same day).
   - Next, for complicated entries (like partial payments or weird bank narratives), our AI steps in to connect the dots.
4. You will see a list of **Suggested Matches** in the split-view panel.

## Step 3: The "Human-in-the-Loop" Approval
We *never* change your accounting ledger without your permission.
1. Review the suggested matches on the Reconcile page.
2. If the match looks correct, click the green **Approve** button. The invoice will be marked as paid, and the bank transaction will be marked as matched.
3. If the AI made a mistake, click the red **Reject** button. The transaction will be returned to the pool for manual matching later.

## Step 4: Oops! How to Undo a Mistake
Did you accidentally click Approve on the wrong match? Don't worry.
1. Click the **History** tab at the top of the Reconcile page.
2. This shows a log of every match you've approved.
3. Find the incorrect match and click **Undo**. The transaction will immediately be reversed, fixing your ledger instantly.
