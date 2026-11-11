import json,sys,collections
base=sys.argv[1]
rec=json.load(open(base+'.rec.json'))
frames=rec['frames']; marks=rec['marks']
def win(t0,t1):
    f=[d for t,d in frames if t0<=t<=t1]
    return dict(n=len(f),over33=sum(1 for d in f if d>33.4),max=round(max(f),1) if f else 0)
res={}
ins=[m for m in marks if m['k']=='offense-overlay:in']; inn=[m for m in marks if m['k']=='inning-overlay:in']
for i,m in enumerate(ins): res[f'offense_appear_{i+1}']=win(m['t']-100,m['t']+600)
for i,m in enumerate(inn): res[f'inning_appear_{i+1}']=win(m['t']-100,m['t']+600)
for i,m in enumerate(ins):
    out=[x for x in marks if x['k']=='offense-overlay:out' and x['t']>m['t']][0]
    res[f'offense_whole_{i+1}']=win(m['t'],out['t'])
res['whole_run']=win(0,1e12)
long=[l for l in rec['long']]
res['longtasks']=[(round(l['t']),round(l['d'])) for l in long if l['d']>=50 and l['t']>rec['t0']]
# trace analysis
try:
    tr=json.load(open(base+'.trace.json'))
    ev=tr['traceEvents'] if isinstance(tr,dict) else tr
    ev=[e for e in ev if e.get('ph')=='X' or e.get('ph')=='B' or e.get('ph')=='E']
    # find renderer main thread: thread with most RunTask
    cnt=collections.Counter((e['pid'],e['tid']) for e in ev if e.get('name') in('FunctionCall','UpdateLayoutTree'))
    (pid,tid),_=cnt.most_common(1)[0]
    main=[e for e in ev if e['pid']==pid and e['tid']==tid and e.get('ph')=='X']
    tasks=[e for e in main if e['name']=='RunTask' and e['dur']>=50000]
    cat={'script':('FunctionCall','EvaluateScript','v8.callFunction','TimerFire','FireAnimationFrame','RunMicrotasks','EventDispatch','XHRReadyStateChange'),'style':('UpdateLayoutTree','RecalculateStyles'),'layout':('Layout',),'paint':('Paint','PrePaint','Layerize','Commit','UpdateLayer','CompositeLayers'),'composite':('Composite',)}
    # raster/gpu time per appear window (all threads) — software raster shows up here, not on the main thread
    t0=min(e['ts'] for e in ev if e.get('ts'))
    rt=[e for e in ev if e.get('name')=='RasterTask' and e.get('ph')=='X']
    res['raster_ms_total']=round(sum(e['dur'] for e in rt)/1000)
    res['main_ms_total']={n:round(sum(e['dur'] for e in main if e['name']==n)/1000) for n in ('FunctionCall','UpdateLayoutTree','Layout','PrePaint','Paint','Layerize','Commit','UpdateLayer')}
    out=[]
    for t in tasks:
        a,b=t['ts'],t['ts']+t['dur']
        inside=[e for e in main if e is not t and a<=e['ts']<=b and e['name']!='RunTask']
        # self durations of top-level-ish: sum by category using non-nesting approximation: only count events not contained in another counted event of same category
        sums={}
        for k,names in cat.items():
            es=sorted([e for e in inside if e['name'] in names],key=lambda e:e['ts'])
            tot=0;end=0
            for e in es:
                s,f=e['ts'],e['ts']+e['dur']
                if f>end: tot+=f-max(s,end); end=f
            sums[k]=round(tot/1000)
        kids=collections.Counter()
        for e in inside:
            if e['name'] in ('FunctionCall','EvaluateScript','v8.callFunction','TimerFire','FireAnimationFrame','EventDispatch'):
                kids[e['name']]+=1
        out.append(dict(dur=round(t['dur']/1000),at_ms_rel=round((a-ev[0]['ts'])/1000),**sums))
    res['task_breakdown']=out
except Exception as e: res['trace_err']=str(e)
print(json.dumps(res,ensure_ascii=False,indent=1))
