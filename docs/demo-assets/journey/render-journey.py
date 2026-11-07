"""Animate generated journey artwork into a silent 27-second film.
Assets remain unchanged; Pillow composites video frames and ffmpeg encodes H.264.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math, subprocess, sys
ROOT=Path(__file__).resolve().parent
W,H,FPS,DURATION=1920,1080,30,27
PAPER=(248,237,221); INK='#23453f'; GOLD='#bc8731'; GRAY='#6e756b'
env=Image.open(ROOT/'environment.png').convert('RGB')
poses=Image.open(ROOT/'character-poses.png').convert('RGBA')
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def ft(n,b=False): return ImageFont.truetype(BOLD if b else FONT,n)
def txt(d,xy,s,size=30,c=INK,b=False): d.text(xy,s,font=ft(size,b),fill=c)
def smooth(x): x=max(0,min(1,x)); return x*x*(3-2*x)
# Fixed registration points keep the actor's head and feet stable across poses.
frames=[]
for col,row in [(0,0),(1,0),(2,0),(0,1),(1,1),(2,1)]:
 cell=poses.crop((col*512,row*512,col*512+512,row*512+512))
 # Each frame has its own recorded horizontal pivot; original artwork is unmodified.
 frames.append(cell)
pivots=[285,277,280,286,269,274]
stops=[180,535,855,1240,1590,1940]
# Native artwork coordinates; a short settle at each station creates legible pacing.
keys=[(0,45),(1.1,180),(2.1,180),(4.1,535),(5.8,535),(8,855),(10.1,855),(12.2,1240),(14,1240),(16.1,1590),(18,1590),(20.2,1940),(27,1940)]
chapters=[('Connect the workspace','VS Code · local embeddings · your coding assistant'),('Explore the system','Code graph · architecture · ERD'),('Plan. Review. Approve.','Epic → stories → tasks · human approval'),('Build and verify','Implementation · tests · code review'),('Publish and track','GitHub issues · delivery board'),('Follow the evidence','Decisions · approvals · code · validation')]
def position(t):
 for (ta,a),(tb,b) in zip(keys,keys[1:]):
  if t<=tb:
   p=(t-ta)/(tb-ta); return a+(b-a)*smooth(p),a!=b
 return 1940,False
def frame(t):
 idx=min(5,int(t/4)); end=smooth((t-23.3)/2.5)
 scale=1.8+(0.83-1.8)*end
 base=870-45*end; y=base-580*scale
 x,moving=position(t)
 maxcam=max(0,env.width*scale-W)
 cam=max(0,min(maxcam,x*scale-660))
 # Closing pullback reveals the whole path rather than cutting to another slide.
 cam=cam*(1-end)
 ox=(W-env.width*scale)/2 if env.width*scale<W else -cam
 im=Image.new('RGB',(W,H),PAPER)
 bg=env.resize((round(env.width*scale),round(env.height*scale)),Image.Resampling.LANCZOS)
 im.paste(bg,(round(ox),round(y)))
 d=ImageDraw.Draw(im)
 sx=ox+x*scale; sy=base+17*scale
 # Gold evidence pulse follows the path; stationary nodes keep a record of progress.
 for p in stops:
  if p<=x:
   px=ox+p*scale
   d.ellipse((px-6,base-6,px+6,base+6),fill=GOLD)
 d.ellipse((sx-39*scale,sy-6,sx+39*scale,sy+6),fill='#d5cbb7')
 pose=(int(t*7)%4) if moving else (5 if idx==2 or idx==5 else 4)
 actor_scale=.63*scale
 sprite=frames[pose].resize((round(512*actor_scale),round(512*actor_scale)),Image.Resampling.LANCZOS)
 # Baseline of shoes is 488 in each original sprite cell.
 ax=round(sx-pivots[pose]*actor_scale); ay=round(sy-488*actor_scale)
 im.paste(sprite,(ax,ay),sprite)
 d=ImageDraw.Draw(im)
 txt(d,(95,60),'insrc',43,INK,True)
 txt(d,(1530,79),'THE DELIVERY JOURNEY',18,GRAY,True)
 if end<.55:
  local=t%4; a=min(1,local/.3,(4-local)/.25) if t<20 else 1
  # One brief caption at a time; the visual world never cuts away.
  cap=Image.new('RGBA',(W,240)); cd=ImageDraw.Draw(cap)
  txt(cd,(95,128),chapters[idx][0],57,INK,True)
  txt(cd,(98,205),chapters[idx][1],27,GRAY)
  cap.putalpha(cap.getchannel('A').point(lambda v:int(v*max(0,a)*(1-end))))
  im.paste(cap,(0,0),cap)
 else:
  txt(d,(95,153),'From intent to evidence.',72,INK,True)
  txt(d,(99,247),'One connected journey. Every decision leaves a trace.',32,GRAY)
 # A quiet shared baseline, no cards or slide panels.
 d=ImageDraw.Draw(im)
 txt(d,(95,974),'UNDERSTAND  /  APPROVE  /  BUILD  /  VERIFY  /  TRACE',21,GRAY,True)
 txt(d,(1570,970),f'{min(27,int(t)+1):02} / 27',23,GRAY)
 d.line((95,1030,1825,1030),fill='#d9cdb9',width=2)
 d.line((95,1030,95+1730*min(t/26.7,1),1030),fill=GOLD,width=4)
 return im
if __name__=='__main__':
 if '--preview' in sys.argv:
  for t in [1.5,4.8,9,13,17,22,26]: frame(t).save(ROOT/f'frame-{t:g}.jpg')
  sheet=Image.new('RGB',(960,1080),PAPER)
  for i,t in enumerate([1.5,4.8,9,13,17,22,26]):
   f=frame(t); f.thumbnail((480,270)); sheet.paste(f,((i%2)*480,(i//2)*270))
  sheet.save(ROOT/'contact-sheet.jpg'); sys.exit()
 out=ROOT/'insrc-journey-27s.mp4'
 proc=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(out)],stdin=subprocess.PIPE)
 for i in range(DURATION*FPS): proc.stdin.write(frame(i/FPS).tobytes())
 proc.stdin.close()
 if proc.wait(): raise SystemExit('Encoding failed')
 print(out)
