"""Original exploration crew opening; 5-second branding + 27-second journey."""
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
from functools import lru_cache
import math,random,subprocess,sys
R=Path(__file__).resolve().parent
W,H,FPS=1920,1080,30
NAVY='#0b1e2d';WHITE='#f4eddd';GOLD='#e6b96d';MUTED='#aec6cb';TEAL='#245d64'
F='/System/Library/Fonts/Supplemental/Arial.ttf';B='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
env=Image.open(R/'research-vessel.png').convert('RGB');crew=Image.open(R/'crew.png').convert('RGBA')
actors=[crew.crop(b) for b in [(0,0,570,1024),(570,0,1005,1024),(1005,0,1536,1024)]]
logo=Image.open(R.parents[2]/'site/insrc-icon-transparent.png').convert('RGBA')
random.seed(31);stars=[(random.randrange(W),random.randrange(H),random.randrange(1,3)) for _ in range(150)]
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def text(d,xy,s,n=30,c=WHITE,b=False):d.text(xy,s,font=ImageFont.truetype(B if b else F,n),fill=c)
def center(d,y,s,n,c=WHITE,b=False):
 f=ImageFont.truetype(B if b else F,n);text(d,((W-d.textlength(s,font=f))/2,y),s,n,c,b)
def sky(t):
 im=Image.new('RGB',(W,H),NAVY);d=ImageDraw.Draw(im)
 for x,y,r in stars:
  bright=int(110+40*math.sin(t*.5+x));d.ellipse((x,y,x+r,y+r),fill=(bright,bright,min(255,bright+20)))
 return im
@lru_cache(maxsize=2)
def backdrop(w,h):return env.resize((w,h),Image.Resampling.LANCZOS)
def intro(t):
 im=sky(t)
 for start,kind in [(0,'brand'),(1.1,'tag'),(2.2,'open')]:
  a=smooth((t-start)/.65);layer=Image.new('RGBA',(W,H));d=ImageDraw.Draw(layer)
  if kind=='brand':
   l=logo.resize((280,280),Image.Resampling.LANCZOS);layer.alpha_composite(l,(820,65));center(d,350,'insrc',220,WHITE,True)
  elif kind=='tag':center(d,635,'Bring your own AI',100)
  else:center(d,800,'Open source',72,GOLD)
  layer.putalpha(layer.getchannel('A').point(lambda v:int(v*a)))
  im.paste(layer,(0,0),layer)
 return im
stops=[205,575,925,1270,1625,1990]
chapters=[('Connect the workspace','VS Code · local embeddings · your coding assistant'),('Explore the system','Code graph · architecture · ERD'),('Plan. Review. Approve.','Epic → stories → tasks · human approval'),('Build and verify','Implementation · tests · code review'),('Publish and track','GitHub issues · delivery board'),('Follow the evidence','Decisions · approvals · code · validation')]
def journey(t):
 idx=min(5,int(t/4));local=t-idx*4;end=smooth((t-23.3)/2.5)
 scale=1.6+(.84-1.6)*end
 floor=930-40*end; oy=floor-610*scale
 maxcam=max(0,env.width*scale-W)
 target=max(0,min(maxcam,stops[idx]*scale-720));prev=max(0,min(maxcam,stops[max(0,idx-1)]*scale-720))
 cam=(prev+(target-prev)*smooth(local/1.45))*(1-end)
 ox=(W-env.width*scale)/2 if env.width*scale<W else -cam
 im=sky(t);bg=backdrop(round(env.width*scale),round(env.height*scale));im.paste(bg,(round(ox),round(oy)))
 d=ImageDraw.Draw(im);d.rectangle((0,0,W,255),fill=NAVY);d.rectangle((0,960,W,H),fill=NAVY)
 # Stationary popup crew, never a walking cycle.
 arrive=.1 if idx==0 else 1.45;show=smooth((local-arrive)/.45)*(1 if idx==5 else smooth((4-local)/.3))
 def person(which,world):
  if show<=0:return
  sc=.34*scale*(.94+.06*show);a=actors[which];sp=a.resize((round(a.width*sc),round(a.height*sc)),Image.Resampling.LANCZOS)
  sp.putalpha(sp.getchannel('A').point(lambda v:int(v*show)))
  px=ox+world*scale;py=floor
  im.paste(sp,(round(px-sp.width/2),round(py-980*sc)),sp)
 person([0,1,0,0,0,1][idx],stops[idx]-65)
 if idx==2:person(2,stops[idx]+110)
 if end>.5:
  d=ImageDraw.Draw(im);text(d,(95,113),'From intent to evidence.',69,WHITE,True);text(d,(98,205),'One connected journey. Every decision leaves a trace.',30,MUTED)
 else:
  a=smooth((local-(1.45 if idx else 0))/.3)*(1 if idx==5 else smooth((4-local)/.3))*(1-end)
  layer=Image.new('RGBA',(W,H));ld=ImageDraw.Draw(layer)
  text(ld,(95,118),chapters[idx][0],57,WHITE,True);text(ld,(98,204),chapters[idx][1],27,MUTED)
  layer.putalpha(layer.getchannel('A').point(lambda v:int(v*a)));im.paste(layer,(0,0),layer)
 # Original circular AI guide and gold hop trail in scene coordinates.
 def orb(moment):
  step=min(5,max(0,int(moment/4)));phase=max(0,moment-step*4);p=smooth(phase/1.45)
  world=stops[max(0,step-1)]+(stops[step]-stops[max(0,step-1)])*p
  hop=math.sin(math.pi*p) if step and phase<1.45 else 0
  return ox+world*scale,330-100*hop-4*abs(math.sin(moment*2.3))
 trail=Image.new('RGBA',(W,H));td=ImageDraw.Draw(trail)
 for k in range(17,0,-1):
  past=t-k*.055
  if idx and idx*4<=past and local<2.4:
   px,py=orb(past);alpha=int(200*(1-k/19)*max(0,1-max(0,local-1.45)/.95));r=3+(17-k)*.2
   td.ellipse((px-r,py-r,px+r,py+r),fill=(239,190,104,alpha))
 im.paste(trail,(0,0),trail);d=ImageDraw.Draw(im);x,y=orb(t)
 d.ellipse((x-49,y-49,x+49,y+49),fill='#153844',outline=GOLD,width=3)
 d.arc((x-40,y-40,x+40,y+40),15,165,fill='#70c4c6',width=3)
 for ex in (x-15,x+15):d.rounded_rectangle((ex-4,y-10,ex+4,y+7),radius=4,fill=WHITE)
 d.arc((x-14,y+7,x+14,y+24),0,180,fill=GOLD,width=2)
 text(d,(95,48),'insrc',40,WHITE,True);text(d,(1530,57),'AI-ASSISTED EXPLORATION',17,GOLD,True)
 text(d,(95,993),'UNDERSTAND  /  APPROVE  /  BUILD  /  VERIFY  /  TRACE',21,MUTED,True)
 d.line((95,1040,1825,1040),fill='#39505b',width=2);d.line((95,1040,95+1730*min(t/26.7,1),1040),fill=GOLD,width=4)
 return im

def frame(t):return intro(t) if t<5 else journey(t-5)
if '--preview' in sys.argv:
 sheet=Image.new('RGB',(960,1080),NAVY)
 for i,t in enumerate([3,7,11,15,19,23,27,31]):
  f=frame(t);f.thumbnail((480,270));sheet.paste(f,((i%2)*480,(i//2)*270))
 sheet.save(R/'contact-sheet.jpg');frame(3).save(R/'opening-poster.jpg');sys.exit()
out=R/'insrc-exploration-opening-32s.mp4'
p=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','30','-i','-','-an','-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(out)],stdin=subprocess.PIPE)
for i in range(32*FPS):p.stdin.write(frame(i/FPS).tobytes())
p.stdin.close()
if p.wait():raise SystemExit('Encoding failed')
print(out)
