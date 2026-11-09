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
atlas=Image.open(R/'environment-atlas.png').convert('RGB')
rooms=[atlas.crop((round(c*atlas.width/3),round(r*atlas.height/2),round((c+1)*atlas.width/3),round((r+1)*atlas.height/2))) for r in range(2) for c in range(3)]
rooms[5]=Image.open(R/'command-bridge.png').convert('RGB')
chapters=[('Connect the workspace','ARRIVAL BAY','VS Code · local embeddings · your coding assistant'),('Explore the system','OBSERVATION LAB','Code graph · architecture · ERD'),('Plan. Review. Approve.','MISSION BRIEFING','Epic → stories → tasks · human approval'),('Build and verify','ENGINEERING','Implementation · tests · code review'),('Publish and track','DISPATCH HANGAR','GitHub issues · delivery board'),('Follow the evidence','COMMAND BRIDGE','Decisions · approvals · code · validation')]
# Camera work is separate from character presence: no walking or sliding humans.
def room_image(idx,phase):
 source=rooms[idx];z=1.04+.065*smooth(phase/4)
 rw=round(W*z);rh=round(800*z)
 bg=source.resize((rw,rh),Image.Resampling.LANCZOS)
 px=round((rw-W)*(.25+.5*smooth(phase/4)))
 py=round((rh-800)*.45)
 return bg.crop((px,py,px+W,py+800))
def journey(t):
 idx=min(5,int(t/4));local=t-idx*4;ending=smooth((t-24)/2)
 im=sky(t);bg=room_image(idx,min(local,4))
 if idx and local<.65:bg=Image.blend(room_image(idx-1,4),bg,smooth(local/.65))
 im.paste(bg,(0,220))
 # A room-specific light animation: connections, scans, core pulses or dispatch signals.
 fx=Image.new('RGBA',(W,H));d=ImageDraw.Draw(fx)
 if idx==0:
  for k in range(7):
   p=(t*.24+k/7)%1;x=1060+460*p;y=688-35*math.sin(p*math.pi)
   d.ellipse((x-5,y-5,x+5,y+5),fill=(255,212,137,140))
 elif idx==1:
  for k in range(2):
   r=60+((t*35+k*55)%115);a=int(110*(1-(r-60)/115))
   d.ellipse((970-r,485-r*.45,970+r,485+r*.45),outline=(114,228,225,a),width=3)
 elif idx==2:
  p=(t*.2)%1;x=670+670*p;y=740-90*math.sin(p*math.pi)
  d.ellipse((x-7,y-7,x+7,y+7),fill=(255,214,140,170))
 elif idx==3:
  r=65+20*math.sin(t*2);d.ellipse((1660-r,530-r,1660+r,530+r),outline=(119,235,232,115),width=5)
 elif idx==4:
  for k in range(5):
   p=(t*.35+k/5)%1;x=1280+300*p;y=610+300*p
   d.line((x,y,x+19,y+20),fill=(255,220,151,int(170*p)),width=5)
 else:
  y=430+(t*.15%1)*240;d.line((1480,y,1810,y),fill=(144,236,229,90),width=3)
 im.paste(fx,(0,0),fx)
 reveal=smooth((local-(.15 if idx==0 else 1.1))/.45)*(1 if idx==5 else smooth((4-local)/.4))
 def person(which,x):
  a=actors[which];h=640 if idx!=2 else 610;sc=h/1024
  sp=a.resize((round(a.width*sc),h),Image.Resampling.LANCZOS);sp.putalpha(sp.getchannel('A').point(lambda v:int(v*reveal)))
  im.paste(sp,(round(x-sp.width/2),round(986-980*sc)),sp)
 person([0,1,0,0,0,1][idx],350 if idx!=2 else 430)
 if idx==2:person(2,1510)
 # AI crosses the shot on each transition, then settles near the scene's work.
 targets=[1280,1120,975,1500,1320,1150]
 def orb(moment):
  step=min(5,max(0,int(moment/4)));p=moment-step*4
  travel=smooth(p/1.1);x=-80+(targets[step]+80)*travel
  hop=math.sin(math.pi*travel)
  if step==0:x=targets[0];hop=0
  if step<5 and p>3.5:
   q=smooth((p-3.5)/.5);x=targets[step]+(2050-targets[step])*q;hop=math.sin(math.pi*q)
  return x,390-125*hop-6*abs(math.sin(moment*2))
 fx=Image.new('RGBA',(W,H));d=ImageDraw.Draw(fx)
 moving=(idx>0 and local<1.7) or (idx<5 and local>3.5)
 if moving:
  for k in range(18,0,-1):
   x,y=orb(max(0,t-k*.045));r=3+(18-k)*.2
   d.ellipse((x-r,y-r,x+r,y+r),fill=(246,195,108,int(150*(1-k/20))))
 im.paste(fx,(0,0),fx);d=ImageDraw.Draw(im);x,y=orb(t)
 d.ellipse((x-46,y-46,x+46,y+46),fill='#153844',outline=GOLD,width=3)
 d.arc((x-37,y-37,x+37,y+37),15,165,fill='#70c4c6',width=3)
 for ex in (x-14,x+14):d.rounded_rectangle((ex-4,y-10,ex+4,y+7),radius=4,fill=WHITE)
 d.arc((x-12,y+7,x+12,y+22),0,180,fill=GOLD,width=2)
 # Typography lives in its own quiet band, never across the room action.
 d.rectangle((0,0,W,220),fill=NAVY);d.rectangle((0,1020,W,H),fill=NAVY)
 text(d,(85,28),'insrc',38,WHITE,True)
 text(d,(1460,44),chapters[idx][1],18,GOLD,True)
 text(d,(85,95),'From intent to evidence.' if ending>.5 else chapters[idx][0],57,WHITE,True)
 text(d,(88,173),'One connected journey. Every decision leaves a trace.' if ending>.5 else chapters[idx][2],27,MUTED)
 d.line((85,1050,1835,1050),fill='#39505b',width=2);d.line((85,1050,85+1750*min(t/26.7,1),1050),fill=GOLD,width=4)
 return im

def frame(t):return intro(t) if t<5 else journey(t-5)
if '--preview' in sys.argv:
 sheet=Image.new('RGB',(960,1080),NAVY)
 for i,t in enumerate([3,7,11,15,19,23,27,31]):
  f=frame(t);f.thumbnail((480,270));sheet.paste(f,((i%2)*480,(i//2)*270))
 sheet.save(R/'dynamic-contact-sheet.jpg');frame(3).save(R/'dynamic-opening-poster.jpg');sys.exit()
out=R/'insrc-exploration-bridge-opening-32s.mp4'
p=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','30','-i','-','-an','-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(out)],stdin=subprocess.PIPE)
for i in range(32*FPS):p.stdin.write(frame(i/FPS).tobytes())
p.stdin.close()
if p.wait():raise SystemExit('Encoding failed')
print(out)
