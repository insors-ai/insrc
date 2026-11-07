"""Five-second text-only opening, followed by the existing journey unchanged."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import subprocess
ROOT=Path(__file__).resolve().parent
W,H,FPS=1920,1080,30
BG=(248,237,221);INK=(35,69,63);GOLD=(188,135,49)
REG='/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def ease(x):
 x=max(0,min(1,x)); return 1-(1-x)**3

def frame(t):
 im=Image.new('RGB',(W,H),BG)
 # Staggered type entrances; all three messages hold together before the journey.
 for text,size,start,y,col in [('insrc',150,.12,280,INK),('Bring your own AI',65,1.05,486,INK),('Open source',43,2.15,600,GOLD)]:
  p=ease((t-start)/.65); fade=min(1,max(0,(5-t)/.35))
  layer=Image.new('RGBA',(W,H));d=ImageDraw.Draw(layer)
  font=ImageFont.truetype(BOLD if text=='insrc' else REG,size)
  box=d.textbbox((0,0),text,font=font)
  x=(W-(box[2]-box[0]))/2
  d.text((x,y+24*(1-p)),text,font=font,fill=(*col,round(255*p*fade)))
  im=Image.alpha_composite(im.convert('RGBA'),layer).convert('RGB')
 return im
intro=ROOT/'insrc-intro-5s.mp4'
p=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','30','-i','-','-an','-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(intro)],stdin=subprocess.PIPE)
for i in range(150):p.stdin.write(frame(i/FPS).tobytes())
p.stdin.close()
if p.wait():raise SystemExit('Intro encoding failed')
frame(3.2).save(ROOT/'intro-preview.jpg')
listing=ROOT/'intro-concat.txt'
listing.write_text("file 'insrc-intro-5s.mp4'\nfile 'insrc-journey-ai-hops-27s.mp4'\n")
out=ROOT/'insrc-intro-and-journey-32s.mp4'
subprocess.run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(listing),'-c','copy','-movflags','+faststart',str(out)],check=True)
print(out)
