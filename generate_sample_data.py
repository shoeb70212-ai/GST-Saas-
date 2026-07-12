import os
import zipfile
import pandas as pd
from fpdf import FPDF

# Ensure samples directory exists
output_dir = "d:/GST SAAS/samples"
os.makedirs(output_dir, exist_ok=True)

def create_invoice_pdf(filename, supplier_name, supplier_gstin, invoice_number, total_amount, gst_amount):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    
    pdf.cell(200, 10, txt="TAX INVOICE", ln=True, align="C")
    pdf.cell(200, 10, txt=f"Supplier: {supplier_name}", ln=True, align="L")
    pdf.cell(200, 10, txt=f"Supplier GSTIN: {supplier_gstin}", ln=True, align="L")
    pdf.cell(200, 10, txt="Supplier Address: 123 Tech Park, Bangalore, KA 560001", ln=True, align="L")
    pdf.ln(10)
    
    pdf.cell(200, 10, txt="Buyer: Demo Client Ltd", ln=True, align="L")
    pdf.cell(200, 10, txt="Buyer GSTIN: 29BUYERPAN1234Z", ln=True, align="L")
    pdf.ln(10)
    
    pdf.cell(200, 10, txt=f"Invoice No: {invoice_number}", ln=True, align="L")
    pdf.cell(200, 10, txt="Date: 2023-10-15", ln=True, align="L")
    pdf.ln(10)
    
    pdf.cell(200, 10, txt="Description                   Qty   Rate    Amount", ln=True, align="L")
    pdf.cell(200, 10, txt="-----------------------------------------------------", ln=True, align="L")
    
    taxable = total_amount - gst_amount
    pdf.cell(200, 10, txt=f"Software License              1     {taxable}   {taxable}", ln=True, align="L")
    
    pdf.ln(10)
    cgst = gst_amount / 2
    sgst = gst_amount / 2
    pdf.cell(200, 10, txt=f"Taxable Amount: INR {taxable}", ln=True, align="R")
    pdf.cell(200, 10, txt=f"CGST (9%): INR {cgst}", ln=True, align="R")
    pdf.cell(200, 10, txt=f"SGST (9%): INR {sgst}", ln=True, align="R")
    pdf.cell(200, 10, txt=f"Total Invoice Value: INR {total_amount}", ln=True, align="R")
    
    pdf.output(os.path.join(output_dir, filename))
    print(f"Created {filename}")

# Generate PDFs
create_invoice_pdf("Sample_Invoice_1.pdf", "TechCorp Services", "29ABCDE1234F1Z5", "INV-2023-001", 11800, 1800)
create_invoice_pdf("Sample_Invoice_2.pdf", "Office Supplies Inc", "27QWERT5678G2Z1", "OSI-998", 5900, 900)

# Create ZIP
zip_path = os.path.join(output_dir, "Bulk_Upload_Test.zip")
with zipfile.ZipFile(zip_path, 'w') as zipf:
    zipf.write(os.path.join(output_dir, "Sample_Invoice_1.pdf"), "Sample_Invoice_1.pdf")
    zipf.write(os.path.join(output_dir, "Sample_Invoice_2.pdf"), "Sample_Invoice_2.pdf")
print("Created Bulk_Upload_Test.zip")

# Generate Sample GSTR-2B Excel
gstr2b_data = {
    "GSTIN of Supplier": ["29ABCDE1234F1Z5", "27QWERT5678G2Z1", "07MISSING9999Z3"],
    "Trade/Legal Name": ["TechCorp Services", "Office Supplies Inc", "Missing Vendor Co"],
    "Invoice number": ["INV-2023-001", "OSI-998", "MV-100"],
    "Invoice Date": ["15-Oct-2023", "15-Oct-2023", "10-Oct-2023"],
    "Invoice Value (₹)": [11800, 5900, 20000],
    "Taxable Value (₹)": [10000, 5000, 16949],
    "Integrated Tax (₹)": [0, 0, 3051],
    "Central Tax (₹)": [900, 450, 0],
    "State/UT Tax (₹)": [900, 450, 0],
}
df = pd.DataFrame(gstr2b_data)

excel_path = os.path.join(output_dir, "Sample_GSTR2B.xlsx")
# Writing to excel requires openpyxl
with pd.ExcelWriter(excel_path, engine='openpyxl') as writer:
    df.to_excel(writer, sheet_name="B2B", index=False)
    
print("Created Sample_GSTR2B.xlsx")
