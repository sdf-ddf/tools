# -*- coding: utf-8 -*-
import os
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm

SHOT = "E:/Tools/layerview/shots"
os.makedirs(SHOT, exist_ok=True)

pdf_path = SHOT + "/sample-paper-real.pdf"
c = canvas.Canvas(pdf_path, pagesize=A4)
w, h = A4
y = h - 3 * cm
c.setFont("Helvetica-Bold", 16)
c.drawString(2 * cm, y, "Atmospheric Boundary Layer Retrieval")
y -= 1.2 * cm
c.setFont("Helvetica-Bold", 12)
c.drawString(2 * cm, y, "1. Introduction")
y -= 0.9 * cm
c.setFont("Helvetica", 10)
c.drawString(2 * cm, y, "The ABLH is a key input for air quality models.")
y -= 1.2 * cm
c.setFont("Helvetica-Bold", 12)
c.drawString(2 * cm, y, "2. Method")
y -= 0.9 * cm
c.setFont("Helvetica", 10)
c.drawString(2 * cm, y, "Wavelet covariance transform (WCT) is used to detect the boundary layer top.")
y -= 1.2 * cm
c.setFont("Helvetica-Bold", 12)
c.drawString(2 * cm, y, "3. Results")
y -= 0.9 * cm
c.setFont("Helvetica", 10)
c.drawString(2 * cm, y, "Compared with radiosonde: bias 12 percent, correlation 0.92.")
c.showPage()
c.setFont("Helvetica-Bold", 12)
c.drawString(2 * cm, h - 3 * cm, "4. Conclusion")
c.setFont("Helvetica", 10)
c.drawString(2 * cm, h - 3.9 * cm, "WCT with ground-based lidar stably retrieves daytime ABLH.")
c.save()
print("PDF written:", pdf_path, os.path.getsize(pdf_path), "bytes")

scanned_path = SHOT + "/scanned-real.pdf"
c2 = canvas.Canvas(scanned_path, pagesize=A4)
c2.setFillColorRGB(0.9, 0.9, 0.9)
c2.rect(1 * cm, 1 * cm, 19 * cm, 27 * cm, fill=1, stroke=0)
c2.showPage()
c2.save()
print("Scanned written:", scanned_path, os.path.getsize(scanned_path), "bytes")
