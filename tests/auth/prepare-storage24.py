# Local-only workaround for Docker VFS's cumulative layer disk usage.
# python3 tests/auth/prepare-storage24.py
# AUTH_LAB_STORAGE_ROOTFS=/dev/shm/jn-storage24-root node scripts/test-signatures24.mjs
# Uses 1.1 GiB shared memory; no Docker pin or production runtime is changed.
# Reconstruct EXACT pinned upstream filesystem, verifying every compressed layer.
import urllib.request,json,hashlib,tarfile,io,os,shutil,pathlib
repo='supabase/storage-api';digest='sha256:98ffec5d0678803783c30e404c27f4ec65e97efbe014088f2a86b4b8b54b9f54'
root=pathlib.Path('/dev/shm/jn-storage24-root')
if root.exists():shutil.rmtree(root)
root.mkdir()
token=json.load(urllib.request.urlopen('https://auth.docker.io/token?service=registry.docker.io&scope=repository:'+repo+':pull'))['token']
def get(path):return urllib.request.urlopen(urllib.request.Request('https://registry-1.docker.io/v2/'+repo+'/'+path,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json'}))
raw_manifest=get('manifests/'+digest).read();assert 'sha256:'+hashlib.sha256(raw_manifest).hexdigest()==digest;m=json.loads(raw_manifest)
if 'manifests'in m:
 d=next(x['digest'] for x in m['manifests'] if x['platform']['architecture']=='amd64' and x['platform']['os']=='linux');raw_manifest=get('manifests/'+d).read();assert 'sha256:'+hashlib.sha256(raw_manifest).hexdigest()==d;m=json.loads(raw_manifest)
raw_config=get('blobs/'+m['config']['digest']).read();assert 'sha256:'+hashlib.sha256(raw_config).hexdigest()==m['config']['digest'];pathlib.Path('/dev/shm/jn-storage24-config.json').write_bytes(raw_config)
for i,layer in enumerate(m['layers']):
 raw=get('blobs/'+layer['digest']).read();assert 'sha256:'+hashlib.sha256(raw).hexdigest()==layer['digest']
 with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as archive:
  members=archive.getmembers()
  for item in members:
   p=pathlib.PurePosixPath(item.name)
   assert not p.is_absolute() and '..' not in p.parts
   if p.name.startswith('.wh.'):
    target=root/str(p.parent)/p.name[4:]
    if p.name=='.wh..wh..opq':
     parent=root/str(p.parent)
     if parent.is_dir():
      for entry in parent.iterdir():shutil.rmtree(entry) if entry.is_dir() and not entry.is_symlink() else entry.unlink()
    elif target.exists() or target.is_symlink():shutil.rmtree(target) if target.is_dir() and not target.is_symlink() else target.unlink()
  for item in members:
   if pathlib.PurePosixPath(item.name).name.startswith('.wh.'):continue
   target=root/item.name
   if target.is_symlink() and not item.issym():target.unlink()
   assert target.parent.resolve().is_relative_to(root.resolve()), item.name
   archive.extract(item,root,filter='fully_trusted')
 print('Verified upstream layer',i+1,'/',len(m['layers']),flush=True)
pathlib.Path('/dev/shm/jn-storage24-resolv.conf').write_text('nameserver 127.0.0.11\noptions ndots:0\n')
(root/'etc/resolv.conf').touch()
(root/'var/lib/storage').mkdir(parents=True,exist_ok=True)
print('Pinned upstream filesystem reconstructed in',root,flush=True)
