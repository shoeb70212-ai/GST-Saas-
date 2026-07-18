import fitz
import io
doc = fitz.open()
page = doc.new_page()
page.insert_text((50, 50), "Hello")
doc.save("test2.pdf", encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="123")
doc.close()

doc2 = fitz.open("test2.pdf")
doc2.authenticate("123")

out = io.BytesIO()
doc2.save(out)
out_bytes = out.getvalue()

doc3 = fitz.open(stream=out_bytes, filetype="pdf")
print("needs_pass with save():", doc3.needs_pass)

out2 = doc2.tobytes()
doc4 = fitz.open(stream=out2, filetype="pdf")
print("needs_pass with tobytes():", doc4.needs_pass)
