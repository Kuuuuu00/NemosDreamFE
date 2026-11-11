import json,sys,collections
base=sys.argv[1]
rec=json.load(open(base+'.rec.json')); tr=json.load(open(base+'.trace.json')); ev=tr['traceEvents'] if isinstance(tr,dict) else tr
cal=[e for e in ev if e.get('name')=='calib']
ts0=cal[0]['ts']-rec['t0']*1000
cnt=collections.Counter((e['pid'],e['tid']) for e in ev if e.get('name') in('FunctionCall','UpdateLayoutTree'))
(pid,tid),_=cnt.most_common(1)[0]
main=[e for e in ev if e.get('pid')==pid and e.get('tid')==tid and e.get('ph')=='X']
allx=[e for e in ev if e.get('ph')=='X']
def rng(a,b): # ms perf.now
    A=ts0+a*1000;B=ts0+b*1000
    ins=[e for e in main if A<=e['ts']<=B]
    r={n:round(sum(e['dur'] for e in ins if e['name']==n)/1000) for n in ('FunctionCall','UpdateLayoutTree','Layout','PrePaint','Paint','Layerize','Commit')}
    rast=[e for e in allx if e['name']=='RasterTask' and A<=e['ts']<=B]
    r['raster']=round(sum(e['dur'] for e in rast)/1000)
    # forced reflow / functions
    fn=collections.Counter()
    for e in ins:
        if e['name']=='FunctionCall': fn[(e['args'].get('data',{}).get('functionName') or '?')+'@'+(e['args'].get('data',{}).get('url','').split('/')[-1])]+=e['dur']/1000
    r['topfn']=[(k,round(v)) for k,v in fn.most_common(3)]
    return r
for m in rec['marks']:
    if m['k'].endswith(':in'):
        print(m['k'],round(m['t']),'window -100..+600', rng(m['t']-100,m['t']+600))
# network
print('net during run:',[(n['url']) for n in rec['net']][-12:])
fonts=[e for e in ev if e.get('name')=='ResourceSendRequest' and ('font' in e['args'].get('data',{}).get('url','') or 'gstatic' in e['args'].get('data',{}).get('url','') or 'pretendard' in e['args'].get('data',{}).get('url',''))]
print('font requests in trace:',[(round((e['ts']-ts0)/1000),e['args']['data']['url'][-50:]) for e in fonts])
api=[e for e in ev if e.get('name')=='ResourceReceiveResponse' and 'api.nemosdream' in e['args'].get('data',{}).get('url','')]
print('api responses:',[(round((e['ts']-ts0)/1000),e['args']['data']['url'].split('/v1/')[-1][-25:]) for e in api])
