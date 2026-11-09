"""20-second closing sequence on the approved original command-bridge artwork."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import subprocess,sys
ROOT=Path(__file__).resolve().parent
W,H,FPS,DURATION=1920,1080,30,20
NAVY=(11,30,45);WHITE='#f4eddd';GOLD='#e6b96d';MUTED='#c0d2d5'
REG='/System/Library/Fonts/Supplemental/Arial.ttf';BOLD='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
bridge=Image.open(ROOT/'command-bridge.png').convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
logo=Image.open(ROOT.parents[2]/'site/insrc-icon-transparent.png').convert('RGBA')
def font(n,b=False):return ImageFont.truetype(BOLD if b else REG,n)
def text(d,x,y,s,n=35,c=WHITE,b=False):d.text((x,y),s,font=font(n,b),fill=c)
def centered(d,y,s,n,c=WHITE,b=False):text(d,(W-d.textlength(s,font=font(n,b)))/2,y,s,n,c,b)
def backdrop(final=False):
 overlay=Image.new('RGBA',(W,H));d=ImageDraw.Draw(overlay)
 for x in range(W):
  a=185 if final else int(232-175*min(1,max(0,(x-720)/1000)))
  d.line((x,0,x,H),fill=(*NAVY,a))
 return Image.alpha_composite(bridge.convert('RGBA'),overlay).convert('RGB')
scenes=[
 ('RELIABILITY',['Build confidence','into every change.'],['Explicit human approvals.','Tests, validation and code review.']),
 ('TRACEABILITY',['Follow the evidence.','Understand the decisions.'],['Connect the request, design and approvals','to the code and validation results.']),
 ('COMPLIANCE SUPPORT',['Make reviews','evidence-led.'],['Preserve decisions and approval records.','Support healthcare and finance reviews.'])]
slides=[]
for eyebrow,title,lines in scenes:
 im=backdrop();d=ImageDraw.Draw(im)
 text(d,100,65,'insrc',43,WHITE,True)
 text(d,100,235,eyebrow,25,GOLD,True)
 for j,line in enumerate(title):text(d,95,310+j*90,line,67,WHITE,True)
 for j,line in enumerate(lines):text(d,100,555+j*58,line,33,MUTED)
 d.line((100,945,1820,945),fill='#6c6c58',width=2)
 text(d,100,978,'RELIABLE DELIVERY  /  TRACEABLE EVIDENCE  /  HUMAN CONTROL',22,MUTED,True)
 slides.append(im)
im=backdrop(True);l=logo.resize((210,210),Image.Resampling.LANCZOS);im.paste(l,((W-210)//2,60),l)
d=ImageDraw.Draw(im);centered(d,275,'insrc',120,WHITE,True);centered(d,455,'Thank You',104,WHITE,True)
centered(d,610,'Bring your own AI. Open source.',43,GOLD)
centered(d,725,'GET STARTED',24,MUTED,True)
centered(d,775,'insrc.insors.io',46,WHITE,True)
centered(d,855,'github.com/insors-ai/insrc',38,WHITE)
slides.append(im)
def frame(t):
 idx=min(3,int(t/5));local=t-idx*5
 if idx and local<.45:return Image.blend(slides[idx-1],slides[idx],local/.45)
 if idx==0 and local<.35:return Image.blend(backdrop(),slides[0],local/.35)
 return slides[idx]
if '--preview' in sys.argv:
 sheet=Image.new('RGB',(960,540),NAVY)
 for i,im in enumerate(slides):sheet.paste(im.resize((480,270),Image.Resampling.LANCZOS),((i%2)*480,(i//2)*270))
 sheet.save(ROOT/'bridge-ending-contact.jpg');slides[0].save(ROOT/'bridge-ending-poster.jpg');slides[-1].save(ROOT/'bridge-thank-you.jpg');sys.exit()
out=ROOT/'insrc-bridge-ending-20s.mp4'
p=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','30','-i','-','-an','-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(out)],stdin=subprocess.PIPE)
for i in range(DURATION*FPS):p.stdin.write(frame(i/FPS).tobytes())
p.stdin.close()
if p.wait():raise SystemExit('Encoding failed')
print(out)
