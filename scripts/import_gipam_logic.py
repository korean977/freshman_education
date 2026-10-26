#!/usr/bin/env python3
from pathlib import Path
import re,struct,json,hashlib,argparse,ctypes
parser=argparse.ArgumentParser(description='Import eight remaining primary GIPAM SRC projects; skips backup and application folders.')
parser.add_argument('source_root',type=Path,help='Directory containing the extracted 1.부천종합운동장변전소 folder')
parser.add_argument('--blast-library',type=Path,required=True,help='Shared library built from zlib contrib/blast/blast.c')
parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'station-logic-data.js')
args=parser.parse_args();root=args.source_root
lib=ctypes.CDLL(str(args.blast_library.resolve()))
IN=ctypes.CFUNCTYPE(ctypes.c_uint,ctypes.c_void_p,ctypes.POINTER(ctypes.POINTER(ctypes.c_ubyte)))
OUT=ctypes.CFUNCTYPE(ctypes.c_int,ctypes.c_void_p,ctypes.POINTER(ctypes.c_ubyte),ctypes.c_uint)
lib.blast.argtypes=[IN,ctypes.c_void_p,OUT,ctypes.c_void_p,ctypes.POINTER(ctypes.c_uint),ctypes.POINTER(ctypes.POINTER(ctypes.c_ubyte))]
lib.blast.restype=ctypes.c_int
def decode(p):
 data=p.read_bytes();streams=[]
 for match in re.finditer(rb'[\x00\x01][\x04-\x06]',data[190:]):
  offset=190+match.start();payload=(ctypes.c_ubyte*(len(data)-offset)).from_buffer_copy(data[offset:])
  pointer=ctypes.cast(payload,ctypes.POINTER(ctypes.c_ubyte));left=ctypes.c_uint(len(payload));parts=[];total=0
  @IN
  def read_callback(how,out):return 0
  @OUT
  def write_callback(how,out,n):
   nonlocal total
   total+=n
   if total>2000000:return 1
   parts.append(ctypes.string_at(out,n));return 0
  code=lib.blast(read_callback,None,write_callback,None,ctypes.byref(left),ctypes.byref(pointer))
  if code==0 and total>200:streams.append((offset,b''.join(parts)))
 assert len(streams)==2,(p,'Expected exactly two DCL streams')
 assert streams[0][0]==206 and len(streams[0][1])%176==0 and len(streams[1][1])%740==0,p
 return streams[0][1],streams[1][1]
result={}
for name in ['52s2','52d1','52d2','52db1','52db2','52h1','52h2','52h3']:
 paths=[p for p in root.glob('*/*/*/'+name+'.src') if 'GMWIN' not in str(p)];assert len(paths)==1,(name,paths);p=paths[0];sym,b=decode(p);yms=p.with_suffix('.yms').read_bytes().decode('cp949');pci=p.with_suffix('.pci').read_bytes()
 ranges=[(int(a),int(z)) for _,a,z in re.findall(r'(\d+)\s+S(\d+)\s+E(\d+)',yms.split('이것은 PCI 파일의 Comp내용')[0])]
 assert len(ranges)==struct.unpack_from('<I',pci,43)[0]
 for i,pair in enumerate(ranges):assert pair==struct.unpack_from('<II',pci,47+12*i)
 symbols={}
 for o in range(0,len(sym),176):
  d=sym[o:o+176];n=d[:32].split(b'\0')[0].decode('ascii');symbols[n]={'address':d[85:105].split(b'\0')[0].decode('ascii') if d[82]==1 else str(int.from_bytes(d[71:75],'little'))+'.'+str(d[75])}
 checked=0
 for n,t,addr in re.findall(r'([A-Z][A-Z0-9_]*)\s*:\s*([BF])\s+V\s+(\d+(?:\.\d+)?)',yms):
  assert symbols[n]['address']==(addr if '.' in addr else addr+'.0'),(name,n,addr,symbols[n]);checked+=1
 networks=[];allcontacts=set();allcoils=set()
 for start,end in ranges:
  nodes={};coils=[];func=[];excluded=set()
  for r in range(start,end+1):
   d=b[r*740:(r+1)*740]
   if int.from_bytes(d[2+23:4+23],'little')==21:continue
   for c in range(32):
    o=2+c*23;nodes[r,c]=(int.from_bytes(d[o:o+2],'little'),d[o+2:o+22].split(b'\0')[0].decode('ascii',errors='replace'),d[o+22])
   nodes[r,-1]=(0,'',0)
   if int.from_bytes(d[-2:],'little')==12:coils.append(((r,31),nodes[r,31][1]));allcoils.add(nodes[r,31][1])
  for (r,c),(typ,n,f) in list(nodes.items()):
   if n in ['TON','TP','TOF'] and nodes.get((r,c+1),(0,))[0]==8:
    instance=nodes[r+1,c][1];tm=nodes[r+1,c-1][1];m=re.fullmatch(r'T#([\d.]+)(MS|S)',tm);assert m,(name,r,tm)
    func.append(((r,c),(r,c+1),n,instance,int(float(m[1])*(1 if m[2]=='MS' else 1000))))
    for rr in [r+1,r+2]:
     for cc in [c-1,c,c+1]:excluded.add((rr,cc))
  nodes={k:v for k,v in nodes.items() if k not in excluded};parent={k:k for k in nodes}
  def find(a):
   while parent[a]!=a:parent[a]=parent[parent[a]];a=parent[a]
   return a
  def union(a,z):parent[find(a)]=find(z)
  edges=[];fnedges={(a,z) for a,z,*_ in func}
  for (r,c),(typ,n,f) in nodes.items():
   right=(r,c+1)
   if right in nodes and ((f&24) or nodes[right][2]&4 or (c==-1 and nodes.get((r,1),(0,'',0))[2]&4)):
    rt=nodes[right][0]
    if ((r,c),right) in fnedges:pass
    elif n and rt in [1,2,3,4]:edges.append(((r,c),right,n,rt));allcontacts.add(n)
    else:union((r,c),right)
   down=(r+1,c)
   if down in nodes and ((f&2) or nodes[down][2]&1):union((r,c),down)
  rails=[k for k in nodes if k[1]==-1]
  for at in rails[1:]:union(rails[0],at)
  keys={find(k) for k in nodes};numbers={k:i for i,k in enumerate(sorted(keys))}
  idx=lambda k:numbers[find(k)]
  # Keep only nodes attached to contacts, coils, function pins, or the left rail.
  used={idx(rails[0])}|{idx(k) for k,n in coils}|{idx(k) for a,z,*_ in func for k in [a,z]}|{idx(k) for a,z,*_ in edges for k in [a,z]}
  compact={k:i for i,k in enumerate(sorted(used))};node=lambda k:compact[idx(k)]
  networks.append({'rows':[start,end],'rail':node(rails[0]),'edges':[[node(a),node(z),n,t] for a,z,n,t in edges], 'coils':[[node(k),n] for k,n in coils],'timers':[[node(a),node(z),t,n,ms] for a,z,t,n,ms in func]})
 leaves=sorted(allcontacts-allcoils)
 result[name]={'source':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'rows':len(b)//740,'symbols':len(symbols),'verifiedAddresses':checked,'networks':networks,'inputs':{n:symbols[n]['address'] for n in leaves}}
 print(name,len(networks),'networks',len(allcoils),'coils',len(leaves),'inputs',checked,'verified')
args.output.write_text('/* Generated from the eight remaining primary .src projects; see docs/station-logic-review.md. */\n(function(root){\n const data='+json.dumps(result,separators=(',',':'),ensure_ascii=False)+';\n root.StationLogicData=data;\n if(typeof module!=="undefined"&&module.exports)module.exports=data;\n})(globalThis);\n')

