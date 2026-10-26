#!/usr/bin/env python3
"""Package only public website assets; original drawings and controller files stay out."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import argparse,json,subprocess
ROOT=Path(__file__).resolve().parents[1]
ASSETS=('index.html','power.html','ac-training.css','ac-protection.js','breaker-sequence.js','r1-sequence.js','r2-sequence.js','r3-sequence.js','power-network.js','s1-sequence.js')
class References(HTMLParser):
 def __init__(self):super().__init__();self.paths=[]
 def handle_starttag(self,tag,attrs):
  for key,value in attrs:
   if key in ('src','href') and value and not urlsplit(value).scheme and not value.startswith(('#','//')):
    self.paths.append(unquote(urlsplit(value).path))
def build(output):
 output=output.resolve()
 if output==ROOT or ROOT in output.parents and output.relative_to(ROOT).parts[0] not in ('_site',):
  raise ValueError('Use _site or an output directory outside the checkout.')
 allowed=set(ASSETS)|{'.nojekyll','version.json'}
 if output.exists():
  extras={p.name for p in output.iterdir()}-allowed
  if extras:raise ValueError('Unexpected files in output directory: '+', '.join(sorted(extras)))
  if any(p.is_symlink() or not p.is_file() for p in output.iterdir()):raise ValueError('Output must contain only regular files.')
 output.mkdir(parents=True,exist_ok=True)
 for name in ASSETS:
  data=(ROOT/name).read_bytes();(output/name).write_bytes(data)
 for name in ('index.html','power.html'):
  parser=References();parser.feed((output/name).read_text())
  for target in parser.paths:
   path=(output/target).resolve()
   if output not in path.parents or not path.is_file():raise ValueError(f'{name}: missing or invalid relative asset {target}')
 revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
 (output/'.nojekyll').write_text('')
 (output/'version.json').write_text(json.dumps({'revision':revision,'entry':'index.html'},indent=2)+'\n')
 print(f'Built {len(ASSETS)} website assets in {output}; all HTML navigation and assets resolve.')
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT/'_site');args=parser.parse_args();build(args.output)
