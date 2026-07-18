import fitz
import pymupdf4llm

doc = fitz.open()
page = doc.new_page()
page.insert_text((50, 50), "Hello")
doc.save("test3.pdf", encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="123")
doc.close()

doc2 = fitz.open("test3.pdf")
doc2.authenticate("123")

chunk = fitz.open()
try:
    chunk.insert_pdf(doc2, from_page=0, to_page=0)
    print("insert_pdf success")
except Exception as e:
    print("insert_pdf error:", e)

try:
    md = pymupdf4llm.to_markdown(chunk)
    print("to_markdown success:", md)
except Exception as e:
    print("to_markdown error:", e)
