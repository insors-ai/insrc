"""Render the editable 27-second insrc lifecycle motion graphic. Requires Pillow and ffmpeg."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math, subprocess
ROOT=Path(__file__).resolve().parent
W,H,FPS,DURATION=1920,1080,30,27
BG='#0b201d'; WHITE='#edf8f2'; MUTED='#a7beb5'; GREEN='#78e5b6'; GOLD='#eac980'
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def font(n,b=False): return ImageFont.truetype(BOLD if b else FONT,n)
scenes=[
('Connect your workspace','Start with the tools you trust.', ['VS Code + insrc','Ollama embeddings','Claude Code · Codex · Vibe'],'SETUP'),
('Understand before you change','Explore a full-stack application in context.', ['Analyzer + code graph','Architecture + ERD','Parallel investigations'],'EXPLORE'),
('Turn intent into a plan','Make decisions explicit before implementation.', ['Define the epic','Design stories + tasks','Review + human approval'],'PLAN'),
('Build with evidence','Deliver features and fix tracked issues.', ['Implement the change','Run tests + validation','Review the code'],'BUILD'),
('Follow the work','Keep delivery visible across the team.', ['Publish to GitHub','Epic → story → task','Delivery board + tracker'],'TRACK'),
('Reconstruct every change','Follow the record from request to result.', ['Decisions + approvals','Code + validation results','Linked audit evidence'],'AUDIT')]
labels=['SETUP','EXPLORE','PLAN','BUILD','TRACK','AUDIT']
def ease(x): return 1-(1-max(0,min(1,x)))**3
def text(d,xy,s,size=30,color=WHITE,b=False): d.text(xy,s,font=font(size,b),fill=color)
def characters(layer,t,stage,final=False):
 # Two code-drawn characters: a curious mint robot and a warm evidence buddy.
 sprite=Image.new('RGBA',(360,330)); d=ImageDraw.Draw(sprite)
 bob=int(5*math.sin(t*4)); cy=100+bob
 d.ellipse((78,285,275,305),fill='#061612')
 d.line((165,cy-55,165,cy-78),fill=GREEN,width=6)
 d.ellipse((154,cy-92,176,cy-70),fill=GOLD)
 d.rounded_rectangle((95,cy-52,235,cy+46),radius=30,fill=GREEN)
 d.rounded_rectangle((109,cy-35,221,cy+25),radius=21,fill='#15392f')
 blink=t%3.4>3.2
 for x in (139,190):
  d.rounded_rectangle((x-6,cy-15,x+6,cy+(-11 if blink else 3)),radius=5,fill=WHITE)
 d.arc((150,cy-5,181,cy+17),0,180,fill=WHITE,width=3)
 d.rounded_rectangle((117,cy+55,213,cy+137),radius=20,fill='#4db68d')
 d.rounded_rectangle((139,cy+72,192,cy+111),radius=8,fill='#15392f')
 d.line((150,cy+91,160,cy+101,181,cy+80),fill=GOLD,width=5)
 for x in (140,193):
  d.line((x,cy+132,x,cy+174),fill=GREEN,width=15)
  d.rounded_rectangle((x-15,cy+165,x+16,cy+180),radius=7,fill=WHITE)
 wave=int(12*math.sin(t*5))
 d.line((121,cy+65,84,cy+92,61,cy+51+wave),fill=GREEN,width=13)
 d.ellipse((49,cy+37+wave,72,cy+61+wave),fill=GREEN)
 d.line((209,cy+68,250,cy+85),fill=GREEN,width=13)
 # Stage-specific props, kept away from the narrative text.
 if stage==1 and not final:
  d.ellipse((244,cy+24,309,cy+89),outline=GOLD,width=9)
  d.line((254,cy+83,229,cy+116),fill=GOLD,width=12)
  d.arc((256,cy+35,295,cy+75),195,280,fill=WHITE,width=3)
 elif stage==3 and not final:
  d.line((249,cy+111,286,cy+46),fill='#bacfe2',width=15)
  d.arc((268,cy+16,310,cy+58),0,290,fill='#bacfe2',width=12)
 elif stage==0 and not final:
  d.rounded_rectangle((236,cy+44,320,cy+110),radius=8,fill='#b4c8ed')
  d.rectangle((246,cy+54,310,cy+96),fill='#15392f')
  text(d,(250,cy+60),'>_',24,GREEN,True)
  d.line((228,cy+115,328,cy+115),fill=WHITE,width=7)
 else:
  d.rounded_rectangle((242,cy+24,316,cy+125),radius=9,fill=GOLD)
  d.rounded_rectangle((259,cy+17,299,cy+35),radius=5,fill='#bf9455')
  for y in (52,78,104):
   d.line((252,cy+y,258,cy+y+6,268,cy+y-6),fill='#15392f',width=4)
   d.line((278,cy+y,303,cy+y),fill='#6d6347',width=3)
 layer.alpha_composite(sprite,(1470,160))
 # A small floating companion follows the robot, with a paper trail.
 b=ImageDraw.Draw(layer); x=1410; y=437+int(7*math.sin(t*3+1))
 b.ellipse((x-31,y-29,x+31,y+29),fill='#f3aa8c')
 for ex in (x-11,x+11): b.ellipse((ex-3,y-9,ex+3,y-2),fill=BG)
 b.arc((x-9,y-1,x+9,y+13),0,180,fill=BG,width=3)
 for k in range(3):
  px=x-62-k*28; py=y+int(4*math.sin(t*4-k))
  b.rounded_rectangle((px-8,py-10,px+8,py+10),radius=3,outline=GOLD,width=2)
 if final:
  for k in range(12):
   x=1420+(k*47)%410; y=170+((t-24)*55+k*39)%300
   b.rectangle((x,y,x+6,y+12),fill=[GREEN,GOLD,'#f3aa8c'][k%3])
def frame(t):
 im=Image.new('RGB',(W,H),BG); d=ImageDraw.Draw(im)
 # Quiet architectural grid
 for x in range(0,W,80): d.line((x,0,x,H),fill='#102a25')
 for y in range(0,H,80): d.line((0,y,W,y),fill='#102a25')
 text(d,(110,65),'insrc',48,GREEN,True); text(d,(1510,85),'DEMO LIFECYCLE',20,MUTED,True)
 final=t>=24
 idx=min(5,int(t/4)); local=t-idx*4
 layer=Image.new('RGBA',(W,H)); a=ImageDraw.Draw(layer)
 alpha=1 if final else min(ease(local/.5),max(0,min(1,(4-local)/.3)))
 dy=int(25*(1-ease((t-24 if final else local)/.6)))
 if final:
  text(a,(110,240+dy),'From intent to evidence.',87,WHITE,True)
  text(a,(115,370+dy),'One connected development lifecycle.',42,MUTED)
  a.rounded_rectangle((110,500+dy,1810,650+dy),radius=24,fill='#163c31',outline=GREEN,width=2)
  text(a,(155,545+dy),'Understand. Approve. Build. Verify. Trace.',53,GREEN,True)
 else:
  title,sub,cards,tag=scenes[idx]
  text(a,(115,205+dy),f'0{idx+1} / {tag}',25,GREEN,True)
  text(a,(110,270+dy),title,76,WHITE,True)
  text(a,(115,375+dy),sub,36,MUTED)
  for j,card in enumerate(cards):
   p=ease((local-.35-j*.15)/.5); x=110+j*575; y=500+dy+int(20*(1-p))
   a.rounded_rectangle((x,y,x+550,y+165),radius=22,fill='#17372e',outline='#31594b',width=2)
   text(a,(x+30,y+27),f'0{j+1}',23,GREEN,True)
   text(a,(x+30,y+78),card,30,WHITE,True)
 characters(layer,t,idx,final)
 if alpha<1: layer.putalpha(layer.getchannel('A').point(lambda p:int(p*alpha)))
 im=Image.alpha_composite(im.convert('RGBA'),layer).convert('RGB'); d=ImageDraw.Draw(im)
 # Persistent lifecycle rail
 for j,label in enumerate(labels):
  x=135+j*315; active=final or j<=idx
  if j<5: d.line((x,790,x+315,790),fill='#396b57' if active else '#234238',width=4)
  d.ellipse((x-11,779,x+11,801),fill=GREEN if active else '#315047')
  text(d,(x-30,825),label,22,GREEN if active else MUTED,True)
 d.line((110,920,1810,920),fill='#315047',width=1)
 text(d,(110,956),'TRACEABILITY THROUGHOUT',21,GOLD,True)
 text(d,(585,950),'Request → decisions → approvals → code → validation',29,WHITE)
 d.rectangle((0,H-6,int(W*min(t/DURATION,1)),H),fill=GREEN)
 return im
if __name__=='__main__':
 out=ROOT/'insrc-demo-lifecycle-characters-27s.mp4'
 proc=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(out)],stdin=subprocess.PIPE)
 for i in range(FPS*DURATION): proc.stdin.write(frame(i/FPS).tobytes())
 proc.stdin.close()
 if proc.wait(): raise SystemExit('Video encoding failed')
 for t in [2,6,10,14,18,22,25]: frame(t).save(ROOT/f'preview-{t:02}.jpg')
 print(out)
