"""Standalone original robot orb study. No changes to the journey animation."""
from pathlib import Path
import math, subprocess, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT=Path(__file__).resolve().parent
W,H,FPS,SECONDS=1440,1080,30,8
S=int(os.environ.get("INSRC_ORB_RENDER_SIZE", "800"))
y,x=np.mgrid[-1:1:complex(S),-1:1:complex(S)].astype(np.float32)
rr=x*x+y*y
mask=rr<=1
z=np.sqrt(np.maximum(0,1-rr))
N=np.stack([x,-y,z],-1)
light=np.array([-.5,.7,1.0]);light/=np.linalg.norm(light)
half=light+np.array([0,0,1]);half/=np.linalg.norm(half)
diff=np.maximum(0,N@light)
spec=np.maximum(0,N@half)
edge=(1-z)**3
yy,xx=np.mgrid[0:H,0:W]
halo=np.exp(-(((xx-W*.5)/(W*.48))**2+((yy-H*.44)/(H*.5))**2)*2)
bg=np.zeros((H,W,3),np.uint8)
for k,(base,glow) in enumerate([(7,13),(15,24),(26,31)]):bg[:,:,k]=base+halo*glow
base=Image.fromarray(bg)

def ease(v):v=np.clip(v,0,1);return v*v*(3-2*v)
def blink(t):
    v=1.
    for center in [1.65,1.94,5.6]:
        d=abs(t-center)
        if d<.14:v=min(v,.08+.92*float(ease(d/.14)))
    return v

def sphere(t):
    # A gently turning sphere with a surface-mounted visor, lit in camera space.
    yaw=.29+.075*math.sin(t*math.tau/8)
    pitch=-.12+.035*math.sin(t*math.tau/8)
    a=x*math.cos(yaw)-z*math.sin(yaw)
    b=-y
    c=x*math.sin(yaw)+z*math.cos(yaw)
    u=a;v=b*math.cos(pitch)-c*math.sin(pitch)
    front=b*math.sin(pitch)+c*math.cos(pitch)
    body=np.stack([.73+.20*diff,.79+.18*diff,.83+.16*diff],-1)
    body*= (.40+.60*np.sqrt(z))[...,None]
    body+=spec[...,None]**70*np.array([.48,.46,.42])
    body+=edge[...,None]*np.array([.05,.18,.23])
    # Broad graphite visor follows the curvature, with brushed champagne trim.
    visor=(u/.84)**4+((v-.07)/.48)**4
    rim=(visor<1.12)&(front>0)
    inside=(visor<1)&(front>0)
    trim=np.array([.67,.49,.25])*(.42+.58*diff[...,None])
    body[rim]=trim[rim]
    glass=np.zeros_like(body)+np.array([.012,.032,.048])
    glass+=diff[...,None]*np.array([.014,.025,.032])
    glass+=spec[...,None]**100*np.array([.23,.34,.37])
    # Soft reflection on polished visor, deliberately restrained.
    reflection=np.exp(-((v-(.34+.16*u))/.045)**2)*np.exp(-((u+.28)/.5)**2)
    glass+=reflection[...,None]*np.array([.035,.055,.065])
    body[inside]=glass[inside]
    # Panel joint below the face and a small inset status light.
    joint=(np.abs(v+.59)<.006)&(front>0)
    body[joint]*=.43
    status=((u/.052)**2+((v+.70)/.018)**2)<1
    body[status& (front>0)]=[.15,.80,.83]
    # Eyes follow curved surface; gaze shifts, blinks, then softens into a smile.
    gaze=.065*math.sin(t*math.tau/8)
    opening=blink(t)
    smile=float(ease((t-3.1)/.6)*(1-ease((t-4.8)/.6)))
    eyeglow=np.zeros_like(x)
    eye=np.zeros_like(x)
    for cx in [-.30,.30]:
        ex=u-cx-gaze
        ey=v-.08-.014*math.sin(t*math.tau/8)
        # Rounded luminous capsules become shallow happy arcs.
        arc=.075-.55*ex*ex
        ey=ey-smile*arc
        hh=(.115*(1-smile)+.015*smile)*opening
        dx=np.maximum(np.abs(ex)-.045,0)
        dy=np.maximum(np.abs(ey)-hh,0)
        dist=np.sqrt(dx*dx+dy*dy)-.037
        core=1-ease((dist+.003)/.008)
        glow=np.exp(-np.maximum(dist,0)*48)
        eye=np.maximum(eye,core)
        eyeglow=np.maximum(eyeglow,glow)
    glowcolor=eyeglow[...,None]*np.array([.025,.21,.25])
    body[inside]+=glowcolor[inside]
    ec=np.array([.55,.98,1.0])
    em=eye*inside
    body=body*(1-em[...,None])+ec*em[...,None]
    rgba=np.zeros((S,S,4),np.uint8)
    rgba[:,:,:3]=np.clip(body*255,0,255).astype(np.uint8)
    rgba[:,:,3]=(mask*255).astype(np.uint8)
    return Image.fromarray(rgba).resize((610,610),Image.Resampling.LANCZOS)

def frame(t):
    im=base.copy().convert('RGBA')
    bob=9*math.sin(t*math.tau/4)
    shadow=Image.new('RGBA',(W,H));d=ImageDraw.Draw(shadow)
    d.ellipse((493,827,987,884),fill=(0,0,0,175))
    shadow=shadow.filter(ImageFilter.GaussianBlur(24));im.alpha_composite(shadow)
    d=ImageDraw.Draw(im)
    # Quiet perspective ellipse helps communicate hovering volume.
    d.ellipse((432,814,1008,908),outline=(70,118,134,85),width=2)
    d.ellipse((485,828,955,890),outline=(63,102,118,55),width=1)
    im.alpha_composite(sphere(t),(415,round(205+bob)))
    font='/System/Library/Fonts/Supplemental/Arial.ttf'
    f=ImageFont.truetype(font,23)
    title='AI COMPANION  /  MOTION STUDY'
    d=ImageDraw.Draw(im);d.text(((W-d.textlength(title,font=f))/2,72),title,font=f,fill='#a7bcc8')
    f=ImageFont.truetype(font,22)
    title='Pearl alloy  ·  Smoked glass  ·  Expressive light'
    d.text(((W-d.textlength(title,font=f))/2,978),title,font=f,fill='#7f9ba9')
    return im.convert('RGB')

if __name__=='__main__':
    frame(.7).save(OUT/'robot-orb-poster.png')
    p=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-crf','16','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'robot-orb-preview.mp4')],stdin=subprocess.PIPE)
    for i in range(FPS*SECONDS):p.stdin.write(frame(i/FPS).tobytes())
    p.stdin.close()
    if p.wait():raise RuntimeError('Video encode failed')
    print(OUT/'robot-orb-preview.mp4')
