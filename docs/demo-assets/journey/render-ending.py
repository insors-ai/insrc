"""Twenty-second closing sequence: typography and still artwork, no character motion."""
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import subprocess,sys
ROOT=Path(__file__).resolve().parent
W,H,FPS,DURATION=1920,1080,30,20
BG=(248,237,221);INK='#23453f';GOLD='#bc8731';GRAY='#6e756b'
REG='/System/Library/Fonts/Supplemental/Arial.ttf';BOLD='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
art=Image.open(ROOT/'environment.png').convert('RGB')
logo=Image.open(ROOT.parents[2]/'site/insrc-icon-transparent.png').convert('RGBA')
def font(n,b=False):return ImageFont.truetype(BOLD if b else REG,n)
def text(d,x,y,s,n=35,c=INK,b=False):d.text((x,y),s,font=font(n,b),fill=c)
def centered(d,y,s,n,c=INK,b=False):text(d,(W-d.textlength(s,font=font(n,b)))/2,y,s,n,c,b)
scenes=[
 ('RELIABILITY',['Build confidence','into every change.'],['Explicit human approvals.','Tests, validation and code review.'],(1120,232,1440,600)),
 ('TRACEABILITY',['Follow the evidence.','Understand the decisions.'],['Connect the request, design and approvals','to the code and validation results.'],(1770,205,2155,605)),
 ('COMPLIANCE SUPPORT',['Make reviews','evidence-led.'],['Preserve decisions and approval records.','Support healthcare and finance reviews.'],(1770,205,2155,605))]
slides=[]
for eyebrow,title,lines,box in scenes:
 im=Image.new('RGB',(W,H),BG);d=ImageDraw.Draw(im)
 text(d,100,65,'insrc',43,INK,True)
 text(d,100,235,eyebrow,24,GOLD,True)
 for j,line in enumerate(title):text(d,95,310+j*88,line,67,INK,True)
 for j,line in enumerate(lines):text(d,100,550+j*58,line,32,GRAY)
 # Reuse the approved still illustration as video scene artwork.
 pic=art.crop(box);pic.thumbnail((650,650),Image.Resampling.LANCZOS)
 ratio=min(650/pic.width,650/pic.height);pic=pic.resize((round(pic.width*ratio),round(pic.height*ratio)),Image.Resampling.LANCZOS)
 im.paste(pic,(1190+(650-pic.width)//2,250+(650-pic.height)//2))
 d=ImageDraw.Draw(im);d.line((100,945,1820,945),fill='#d9cdb9',width=2)
 text(d,100,978,'RELIABLE DELIVERY  /  TRACEABLE EVIDENCE  /  HUMAN CONTROL',22,GRAY,True)
 slides.append(im)
im=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(im)
l=logo.resize((210,210),Image.Resampling.LANCZOS);im.paste(l,((W-210)//2,60),l)
d=ImageDraw.Draw(im);centered(d,275,'insrc',120,INK,True);centered(d,455,'Thank You',104,INK,True)
centered(d,610,'Bring your own AI. Open source.',43,GOLD)
centered(d,725,'GET STARTED',24,GRAY,True)
centered(d,775,'insrc.insors.io',46,INK,True)
centered(d,855,'github.com/insors-ai/insrc',38,INK)
slides.append(im)
def frame(t):
 idx=min(3,int(t/5));local=t-idx*5
 # Short dissolves between still compositions; the final thank-you holds to the end.
 if idx and local<.45:return Image.blend(slides[idx-1],slides[idx],local/.45)
 if idx==0 and local<.35:return Image.blend(Image.new('RGB',(W,H),BG),slides[0],local/.35)
 return slides[idx]
if '--preview' in sys.argv:
 sheet=Image.new('RGB',(960,540),BG)
 for i,im in enumerate(slides):
  f=im.resize((480,270),Image.Resampling.LANCZOS);sheet.paste(f,((i%2)*480,(i//2)*270))
 sheet.save(ROOT/'ending-contact.jpg');slides[0].save(ROOT/'ending-poster.jpg');slides[-1].save(ROOT/'ending-thank-you.jpg');sys.exit()
out=ROOT/'insrc-ending-benefits-links-20s.mp4'
p=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','30','-i','-','-an','-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(out)],stdin=subprocess.PIPE)
for i in range(DURATION*FPS):p.stdin.write(frame(i/FPS).tobytes())
p.stdin.close()
if p.wait():raise SystemExit('Encoding failed')
print(out)
