import fitz
import pymupdf4llm

def simulate():
    # 1. Create encrypted PDF
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), "Bank Statement Data")
    doc.save("test_bank.pdf", encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="secret")
    doc.close()

    # 2. Simulate Upload (content = bytes)
    with open("test_bank.pdf", "rb") as f:
        content = f.read()

    pdf_password = "secret"
    
    # Simulate bank_routes.py
    try:
        doc_api = fitz.open(stream=content, filetype="pdf")
        if doc_api.needs_pass:
            auth_result = doc_api.authenticate(pdf_password) if pdf_password else 0
            if not pdf_password or not auth_result:
                raise ValueError("Password rejected")
            # Remove password
            content = doc_api.tobytes()
            print("tobytes() successful. size:", len(content))
    except Exception as e:
        print("API Error:", e)

    # Simulate background task
    try:
        doc_bg = fitz.open(stream=content, filetype="pdf")
        if doc_bg.needs_pass and pdf_password:
            doc_bg.authenticate(pdf_password)
            
        print("needs_pass in bg:", doc_bg.needs_pass)
        
        chunk_size = 5
        total_pages = len(doc_bg)
        print("total pages:", total_pages)
        
        for i in range(0, total_pages, chunk_size):
            chunk_doc = fitz.open()
            for j in range(i, min(i + chunk_size, total_pages)):
                print(f"Inserting page {j}")
                chunk_doc.insert_pdf(doc_bg, from_page=j, to_page=j)
                
            md_text = pymupdf4llm.to_markdown(chunk_doc)
            print("Extracted MD")
    except Exception as e:
        print("BG Error:", e)

if __name__ == "__main__":
    simulate()
