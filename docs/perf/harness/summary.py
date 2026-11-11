import json,sys
def load(b): return json.load(open(f'run/{b}.rec.json'))
def stats(b,cnt):
    r=load(b); c=load(cnt)
    ins=[m['t'] for m in r['marks'] if m['k'] in('offense-overlay:in','inning-overlay:in')]
    off=[m['t'] for m in r['marks'] if m['k']=='offense-overlay:in']
    W=[(t-100,t+600) for t in ins]
    fr=[[d for t,d in r['frames'] if a<=t<=b] for a,b in W]
    allf=[d for f in fr for d in f]
    lt=[l for l in r['long'] if l['d']>=50 and any(a<=l['t']<=b for a,b in W)]
    ltall=[l for l in r['long'] if l['d']>=50 and l['t']>r['t0']]
    # first vs second appearance (offense+following inning window)
    def grp(k): 
        a1,b1=W[2*k][0],W[2*k+1][1] if len(W)>2*k+1 else W[2*k][1]
        f=[d for t,d in r['frames'] if a1<=t<=b1]; return round(max(f),1)
    cm=c['commits']; cin=[m['t'] for m in c['marks'] if m['k'] in('offense-overlay:in','inning-overlay:in')]
    comps=[sum(x['n'] for x in cm if t-100<=x['t']<=t+600) for t in cin]
    ncom=[sum(1 for x in cm if t-100<=x['t']<=t+600) for t in cin]
    return dict(over33=sum(1 for d in allf if d>33.4),over33_each=[sum(1 for d in f if d>33.4) for f in fr],maxf=round(max(allf),1),lt_in_window=len(lt),lt_whole=len(ltall),first=grp(0),second=grp(1) if len(W)>=4 else None,comps_each=comps,comps_total=sum(comps),commits=sum(ncom))
out={}
for k,(b,c) in {'before_1x':('B1','BC'),'before_4x':('B4','BC'),'after_1x':('A1','AC'),'after_4x':('A4','AC')}.items():
    out[k]=stats(b,c); print(k,out[k])
json.dump(out,open('summary.json','w'),indent=1)
