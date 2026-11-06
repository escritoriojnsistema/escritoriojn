function crc32(b:Buffer){let c=0xffffffff;for(const byte of b){c^=byte;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
/** Uncompressed ZIP; byte-identical signed PDFs, no archive metadata from clients. */
export function zipDocuments(files:Buffer[]):Buffer{
 if(!files.length||files.length>1000||files.reduce((n,b)=>n+b.length,0)>33554432)throw Error('EXPORT_LIMIT');
 const local:Buffer[]=[],central:Buffer[]=[];let offset=0;
 files.forEach((b,i)=>{const name=Buffer.from(`documento-${i+1}.pdf`),crc=crc32(b),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt32LE(crc,14);h.writeUInt32LE(b.length,18);h.writeUInt32LE(b.length,22);h.writeUInt16LE(name.length,26);local.push(h,name,b);
 const d=Buffer.alloc(46);d.writeUInt32LE(0x02014b50);d.writeUInt16LE(20,4);d.writeUInt16LE(20,6);d.writeUInt32LE(crc,16);d.writeUInt32LE(b.length,20);d.writeUInt32LE(b.length,24);d.writeUInt16LE(name.length,28);d.writeUInt32LE(offset,42);central.push(d,name);offset+=h.length+name.length+b.length;});
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
