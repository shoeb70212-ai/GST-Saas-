import fitz

def test():
    try:
        # Create a dummy pdf
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((50, 50), "Hello World")
        # Save it with password
        doc.save("test_enc.pdf", encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw="123", user_pw="123")
        doc.close()

        # Open it
        doc2 = fitz.open("test_enc.pdf")
        print("needs_pass before:", doc2.needs_pass)
        auth = doc2.authenticate("123")
        print("auth:", auth)
        
        # tobytes
        b = doc2.tobytes()
        
        # open from bytes
        doc3 = fitz.open(stream=b, filetype="pdf")
        print("needs_pass after tobytes():", doc3.needs_pass)

    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test()
